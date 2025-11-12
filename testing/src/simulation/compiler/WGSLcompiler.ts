import { Compiler, type CommandMap } from "./compiler";

export const WORKGROUP_SIZE = 64;

const COMMANDS: CommandMap = {
    moveUp: 'agent.y -= {arg};',
    moveDown: 'agent.y += {arg};',
    moveLeft: 'agent.x -= {arg};',
    moveRight: 'agent.x += {arg};',
};

/**
 * Normalizes arguments for WGSL (ensures inputs.* references are preserved)
 */
function normalizeWGSLArgument(arg: string): string {
    return arg.replace(/inputs\.([a-zA-Z_]\w*)/g, 'inputs.$1');
}

export const compileDSLtoWGSL = (lines: string[], inputs: string[], logger: any): string => {
    const statements: string[] = [];

    for (const line of lines) {
        const parsed = Compiler.parseCommandLine(line);
        if (parsed) {
            const normalizedArg = normalizeWGSLArgument(parsed.argument);
            const statement = Compiler.applyCommandTemplate(COMMANDS[parsed.command], normalizedArg);
            statements.push(statement);
        }
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
        @compute @workgroup_size(${WORKGROUP_SIZE}, 1, 1)
        fn main(
            @builtin(global_invocation_id) global_id : vec3<u32>,
            @builtin(workgroup_id) workgroup_id : vec3<u32>,
            @builtin(local_invocation_id) local_id : vec3<u32>,
            @builtin(num_workgroups) num_workgroups : vec3<u32>
        ) {
            let group_index = workgroup_id.x
                + workgroup_id.y * num_workgroups.x
                + workgroup_id.z * num_workgroups.x * num_workgroups.y;
            let i = group_index * ${WORKGROUP_SIZE}u + local_id.x;
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
