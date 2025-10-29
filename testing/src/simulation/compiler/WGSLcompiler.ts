import type { CommandMap } from "./compiler";
import { AVAILABLE_COMMANDS_LIST } from "./compiler";

export const WORKGROUP_SIZE = 32;

const COMMANDS: CommandMap = {
    moveUp: 'agent.y -= {arg};',
    moveDown: 'agent.y += {arg};',
    moveLeft: 'agent.x -= {arg};',
    moveRight: 'agent.x += {arg};',
}

export const compileDSLtoWGSL = (lines: string[], inputs: string[], logger: any): string => {
    const statements: string[] = [];

    for (const line of lines) {
        const s = parseLine(line);
        if (s) statements.push(s);
    }

    if (statements.length === 0) {
        logger.warn('No WGSL statements produced from DSL. Emitting identity shader.');
    }

    const inputFields =
        inputs.length > 0
            ? inputs.map(k => `${k}: f32,`).join('\n  ')
            : 'dummy: f32,';

    const inputStruct = `
        struct Inputs {
            ${inputFields}
        };

        @group(0) @binding(1) var<uniform> inputs: Inputs;
    `.trim();

    const agentStruct = `
        struct Agent {
            id : f32,
            x  : f32,
            y  : f32,
        };

        @group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
    `.trim();

    const mainBody = statements.length > 0 ? statements.join('\n    ') : '// no-op';

    const computeFn = `
        @compute @workgroup_size(${WORKGROUP_SIZE})
        fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
            let i = global_id.x;
            if (i < arrayLength(&agents)) {
                var agent = agents[i];
                ${mainBody}
                agents[i] = agent;
            }
        }
        `.trim();

    const wgslCode = [agentStruct, inputStruct, computeFn].join('\n\n');

    return wgslCode;
};

function parseLine(line: string): string | null {
    // Only handle commands for now
    if (!line.includes('(') || !line.includes(')')) return null;

    const cmd = COMMANDS[AVAILABLE_COMMANDS_LIST.find(c => line.startsWith(c + '('))!];
    if (!cmd) return null;

    const argStart = line.indexOf('(') + 1;
    const argEnd = line.indexOf(')');
    const arg = line.substring(argStart, argEnd).trim();

    const wgslArg = arg
        .replace(/inputs\.([a-zA-Z_]\w*)/g, 'inputs.$1');

    return cmd.replace('{arg}', wgslArg);
}
