
export const COMMENT_CHARACTERS = ['//', '#'];

export type AVAILABLE_COMMANDS =
    | 'moveUp'
    | 'moveDown'
    | 'moveLeft'
    | 'moveRight'
    | 'addVelocityX'
    | 'addVelocityY'
    | 'setVelocityX'
    | 'setVelocityY'
    | 'updatePosition'
    | 'borderWrapping'
    | 'borderBounce'
    | 'limitSpeed'
    | 'turn'
    | 'moveForward'
    | 'sense'
    | 'deposit'
    | 'enableTrails'
    | 'print'
    | 'species'
    | 'avoidObstacles'

export const AVAILABLE_COMMANDS_LIST: AVAILABLE_COMMANDS[] = [
    'moveUp',
    'moveDown',
    'moveLeft',
    'moveRight',
    'addVelocityX',
    'addVelocityY',
    'setVelocityX',
    'setVelocityY',
    'updatePosition',
    'borderWrapping',
    'borderBounce',
    'limitSpeed',
    'turn',
    'moveForward',
    'sense',
    'deposit',
    'enableTrails',
    'print',
    'species',
    'avoidObstacles',
];

export type CommandMap = Record<AVAILABLE_COMMANDS, string>;

/**
 * Represents a parsed command with its name and argument
 */
export interface ParsedCommand {
    command: AVAILABLE_COMMANDS;
    argument: string;
}

export interface LineInfo {
    content: string;
    lineIndex: number;
}

/**
 * Parsed DSL line types
 */
export type ParsedLineType =
    | { type: 'empty' | 'brace' | 'else' }
    | { type: 'var'; name: string; expression: string }
    | { type: 'if'; condition: string }
    | { type: 'elseif'; condition: string }
    | { type: 'foreach'; collection: string; varName: string }
    | { type: 'for'; init: string; condition: string; increment: string }
    | { type: 'assignment'; target: string; expression: string }
    | { type: 'command'; command: AVAILABLE_COMMANDS; argument: string }
    | { type: 'unknown' };

export class DSLParser {
    /**
     * Parses a single line of DSL code to identify its type and extract relevant information
     */
    static parseDSLLine(line: string): ParsedLineType {
        const trimmed = line.trim();

        // Handle empty lines or just braces
        if (trimmed === '' || trimmed === '{' || trimmed === '}') {
            return { type: trimmed === '' ? 'empty' : 'brace' };
        }

        // Handle variable declarations: var name = expression;
        if (trimmed.startsWith('var ')) {
            const rest = trimmed.substring(4).trim().replace(/;$/, '');
            const eqIndex = rest.indexOf('=');
            if (eqIndex > 0) {
                const name = rest.substring(0, eqIndex).trim();
                const expression = rest.substring(eqIndex + 1).trim();
                return { type: 'var', name, expression };
            }
        }

        // Handle conditionals: if (condition) {
        if (trimmed.startsWith('if ')) {
            const match = trimmed.match(/if\s*\(([^)]+)\)\s*\{?/);
            if (match) {
                return { type: 'if', condition: match[1] };
            }
        }

        // Handle else if
        if (trimmed.startsWith('} else if') || trimmed.startsWith('else if')) {
            const match = trimmed.match(/(?:} )?else if\s*\(([^)]+)\)\s*\{?/);
            if (match) {
                return { type: 'elseif', condition: match[1] };
            }
        }

        // Handle else
        if (trimmed === '} else {' || trimmed === 'else {' || trimmed === 'else') {
            return { type: 'else' };
        }

        // Handle for loops: for (var i = 0; i < n; i++) {
        if (trimmed.startsWith('for ')) {
            const match = trimmed.match(/for\s*\(([^;]+);([^;]+);([^)]+)\)\s*\{?/);
            if (match) {
                return {
                    type: 'for',
                    init: match[1].trim(),
                    condition: match[2].trim(),
                    increment: match[3].trim()
                };
            }
        }

        // Handle foreach loops: foreach (collection as item) {
        if (trimmed.startsWith('foreach ')) {
            const match = trimmed.match(/foreach\s*\(([^)]+)\s+as\s+(\w+)\)\s*\{?/);
            if (match) {
                return { type: 'foreach', collection: match[1].trim(), varName: match[2] };
            }
        }

        // Handle assignments (but not comparisons)
        if (trimmed.includes('=') && !trimmed.includes('==') && !trimmed.includes('!=') && !trimmed.includes('<=') && !trimmed.includes('>=')) {
            const cleaned = trimmed.replace(/;$/, '');

            // Check for compound assignment operators (+=, -=, *=, /=)
            const compoundMatch = cleaned.match(/^(\w+)\s*([\+\-\*\/])=\s*(.+)$/);
            if (compoundMatch) {
                const varName = compoundMatch[1];
                const op = compoundMatch[2];
                const rhs = compoundMatch[3];
                // Convert compound assignment to regular assignment
                // e.g., vx += expr becomes vx = vx + expr
                return { type: 'assignment', target: varName, expression: `${varName} ${op} ${rhs}` };
            }

            // Regular assignment
            const eqIndex = cleaned.indexOf('=');
            if (eqIndex > 0) {
                const target = cleaned.substring(0, eqIndex).trim();
                const expression = cleaned.substring(eqIndex + 1).trim();
                // Make sure it's not a var declaration (already handled above)
                if (!trimmed.startsWith('var ')) {
                    return { type: 'assignment', target, expression };
                }
            }
        }

        // Try to match as a command
        const parsed = DSLParser.parseCommandLine(trimmed);
        if (parsed) {
            return { type: 'command', command: parsed.command, argument: parsed.argument };
        }

        return { type: 'unknown' };
    }

    /**
     * Parses a single line of DSL code to extract command and argument
     * Returns null if the line is not a valid command
     */
    static parseCommandLine(line: string): ParsedCommand | null {
        // Check if line contains a function call pattern
        if (!line.includes('(') || !line.includes(')')) {
            return null;
        }

        // Find matching command
        const command = AVAILABLE_COMMANDS_LIST.find(cmd => line.startsWith(cmd + '('));
        if (!command) {
            return null;
        }

        // Extract argument between parentheses
        const argStart = line.indexOf('(') + 1;
        const argEnd = line.indexOf(')');
        const argument = line.substring(argStart, argEnd).trim();

        return { command, argument };
    }

    /**
     * Applies a command template by replacing {arg} placeholder
     */
    static applyCommandTemplate(template: string, argument: string): string {
        return template.replace(/{arg}/g, argument);
    }

    /**
     * Parses multiple lines using a command map
     */
    static parseLines(lines: LineInfo[], commandMap: CommandMap): string[] {
        const statements: string[] = [];

        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed && commandMap[parsed.command]) {
                const statement = DSLParser.applyCommandTemplate(
                    commandMap[parsed.command],
                    parsed.argument
                );
                statements.push(statement);
            }
        }

        return statements;
    }
}
