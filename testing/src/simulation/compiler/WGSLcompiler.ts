export const COMMENT_CHARACTERS = ['//', '#'];
export const WORKGROUP_SIZE = 64;

const COMMANDS = [
    { name: 'moveUp', template: 'agent.y = agent.y - ({arg});' },
    { name: 'moveDown', template: 'agent.y = agent.y + ({arg});' },
    { name: 'moveLeft', template: 'agent.x = agent.x - ({arg});' },
    { name: 'moveRight', template: 'agent.x = agent.x + ({arg});' },
];

export const compileDSLtoWGSL = (dslCode: string, logger: any): [string, string[]] => {
    logger.log('Compiling agent code to WGSL:\n', dslCode);

    const lines = dslCode
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !COMMENT_CHARACTERS.some(c => l.startsWith(c)));

    const statements: string[] = [];
    for (const line of lines) {
        const s = parseLine(line);
        if (s) statements.push(s);
    }

    const inputMatches = Array.from(dslCode.matchAll(/inputs\.([a-zA-Z_]\w*)/g));

    const uniformKeys = [...new Set(inputMatches.map(m => m[1]))]; // preserve discovery order

    if (statements.length === 0) {
        logger.warn('No WGSL statements produced from DSL. Emitting identity shader.');
    }

    // Build uniform struct dynamically (at least one field to satisfy uniform binding)
    const uniformStruct =
        uniformKeys.length > 0
            ? `struct Inputs {
  ${uniformKeys.map(k => `${k}: f32,`).join('\n  ')}
};
@group(0) @binding(1) var<uniform> inputs: Inputs;`
            : `struct Inputs { dummy: f32, };
@group(0) @binding(1) var<uniform> inputs: Inputs;`;

    const body = statements.length > 0 ? statements.join('\n    ') : '// no-op';

    const wgslCode = `
struct Agent {
  id : f32,
  x  : f32,
  y  : f32,
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
${uniformStruct}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let i = global_id.x;
  if (i < arrayLength(&agents)) {
    var agent = agents[i];
    ${body}
    agents[i] = agent;
  }
}
`.trim();

    logger.success('Generated WGSL shader:\n', wgslCode);
    return [wgslCode, uniformKeys];
};

function parseLine(line: string): string | null {
    if (COMMENT_CHARACTERS.some(c => line.startsWith(c))) return null;
    if (!line.includes('(') || !line.includes(')')) return null;

    const cmd = COMMANDS.find(c => line.startsWith(c.name + '('));
    if (!cmd) return null;

    const argStart = line.indexOf('(') + 1;
    const argEnd = line.indexOf(')');
    const arg = line.substring(argStart, argEnd).trim();

    // Correctly map inputs.<name> → inputs.<name> (keep identifier; WGSL struct will provide fields)
    const wgslArg = arg
        .replace(/inputs\.([a-zA-Z_]\w*)/g, 'inputs.$1')
        .replace(/Math\./g, ''); // (optional) strip JS Math.

    return cmd.template.replace('{arg}', wgslArg);
}
