import type Logger from "../logger";

const COMMENT_CHARACTERS = ['//', '#'];

const COMMANDS = [
    {
        'name': 'moveUp',
        'template': 'result.y -= {arg};'
    },
    {
        'name': 'moveDown',
        'template': 'result.y += {arg};'
    },
    {
        'name': 'moveLeft',
        'template': 'result.x -= {arg};'
    },
    {
        'name': 'moveRight',
        'template': 'result.x += {arg};'
    },
]

export const compileDSLTtoJS = (dsl: string, logger: Logger): [string, string[]] => {
    logger.log('Compiling agent code: \n      ', dsl);

    const inputsExpected: string[] = [];

    const lines = dsl
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const statements: string[] = [];

    for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed) {
            if (line.includes('inputs.')) {
                const inputMatch = line.match(/inputs\.([a-zA-Z_]\w*)/);
                if (inputMatch && !inputsExpected.includes(inputMatch[1])) {
                    inputsExpected.push(inputMatch[1]);
                }
            }

            statements.push(parsed);
        }
    }

    const identityFunction = `(agent) => ({ ...agent })`;

    if (statements.length < 1) return [identityFunction, []];

    const agentFunction = `(agent, inputs) => {
        const result = { ...agent };
        ${statements.length > 0 ? statements.join('\n') + '\n' : ''}
        return result;
    }`;

    return [agentFunction, inputsExpected];
}


function parseLine(line: string): string | null {
    // Ignore comments
    if (COMMENT_CHARACTERS.some(comment => line.startsWith(comment))) {
        return null;
    }

    // Ignore anything that isn't a command for now
    if (!line.includes('(') || !line.includes(')')) {
        return null;
    }

    const commandMatch = COMMANDS.find(command => line.startsWith(command.name + '('));
    if (!commandMatch) {
        return null;
    }

    const argStart = line.indexOf('(') + 1;
    const argEnd = line.indexOf(')');
    const argument = line.substring(argStart, argEnd).trim();

    const command = commandMatch.template.replace('{arg}', argument);

    return command;
}
