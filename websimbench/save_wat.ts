
import { Compiler } from './src/simulation/compiler/compiler';
import { PREMADE_SIMULATIONS } from './src/config/premadeSimulations';
import * as fs from 'fs';

const compiler = new Compiler();
const dsl = PREMADE_SIMULATIONS['Predator-Prey'];
const result = compiler.compileAgentCode(dsl);

const wat = result.WASMCode;
fs.writeFileSync('debug.wat', wat);
console.log("WAT saved to debug.wat");
