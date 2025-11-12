import type Logger from "../helpers/logger";
import { Compiler, type CommandMap } from "./compiler";

const COMMANDS: CommandMap = {
    moveUp: 'result.y -= {arg};',
    moveDown: 'result.y += {arg};',
    moveLeft: 'result.x -= {arg};',
    moveRight: 'result.x += {arg};',
};

export const compileDSLtoJS = (lines: string[], _inputs: string[], _logger: Logger): string => {
    const statements = Compiler.parseLines(lines, COMMANDS);

    const identityFunction = `(agent) => ({ ...agent })`;

    if (statements.length < 1) return identityFunction;

    const agentFunction = `(agent, inputs) => {
        const result = { ...agent };
        ${statements.join('\n        ')}
        return result;
    }`;

    return agentFunction;
};
