
import { Compiler } from './src/simulation/compiler/compiler';
import { PREMADE_SIMULATIONS } from './src/config/premadeSimulations';

const compiler = new Compiler();
const dsl = PREMADE_SIMULATIONS['Predator-Prey'];
const result = compiler.compileAgentCode(dsl);

const wat = result.WASMCode;

const start = wat.indexOf('(func (export "step_all")');
if (start > -1) {
    // Find matching bracket for the function? WAT functions use balanced parens too.
    // Let's just take a large enough chunk.
    const funcBody = wat.substring(start);
    console.log("STEP_ALL FUNCTION:");
    console.log(funcBody);
}
