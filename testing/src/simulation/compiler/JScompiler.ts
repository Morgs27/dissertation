import type Logger from "../logger";
import type { CommandMap } from "./compiler";
import { AVAILABLE_COMMANDS_LIST } from "./compiler";

const COMMANDS: CommandMap = 
{
    moveUp: 'result.y -= {arg};',
    moveDown: 'result.y += {arg};',
    moveLeft: 'result.x -= {arg};',
    moveRight: 'result.x += {arg};',
}

export const compileDSLtoJS = (lines: string[], inputs: string[], logger: Logger): string => {
    const statements: string[] = [];

    for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed) {
            statements.push(parsed);
        }
    }

    const identityFunction = `(agent) => ({ ...agent })`;

    if (statements.length < 1) return identityFunction;

    const agentFunction = `(agent, inputs) => {
        const result = { ...agent };
        ${statements.length > 0 ? statements.join('\n') + '\n' : ''}
        return result;
    }`;

    return agentFunction;
}


function parseLine(line: string): string | null {
    // Ignore anything that isn't a command for now
    if (!line.includes('(') || !line.includes(')')) {
        return null;
    }

    const commandMatch = COMMANDS[AVAILABLE_COMMANDS_LIST.find(cmd => line.startsWith(cmd) )!];
    
    if (!commandMatch) {
        return null;
    }

    const argStart = line.indexOf('(') + 1;
    const argEnd = line.indexOf(')');
    const argument = line.substring(argStart, argEnd).trim();

    const command = commandMatch.replace('{arg}', argument);

    return command;
}
