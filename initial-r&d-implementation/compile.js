// run with: npx tsx compile.js
import { compileDSLtoJS } from './src/simulation/compiler/JScompiler.ts';
import { compileDSLtoWGSL } from './src/simulation/compiler/WGSLcompiler.ts';
import { compileDSLtoWAT } from './src/simulation/compiler/WATcompiler.ts';
import { boidsDSL } from './boids.ts';

// Preprocess: split into lines and filter out comments/empty lines
const COMMENT_CHARACTERS = ['//', '#'];
const lines = boidsDSL
    .split('\n')
    .filter(l => {
        const trimmed = l.trim();
        return trimmed.length > 0 && !COMMENT_CHARACTERS.some(c => trimmed.startsWith(c));
    });

// Extract inputs
const inputMatches = Array.from(boidsDSL.matchAll(/inputs\.([a-zA-Z_]\w*)/g));
const inputs = [...new Set(inputMatches.map(m => m[1]))];

const jsCode = compileDSLtoJS(lines, inputs, console);

const wgslCode = compileDSLtoWGSL(lines, inputs, console);

const wasmCode = compileDSLtoWAT(lines, inputs, console);

console.log('\n=== Generated JavaScript Code ===\n');
console.log(jsCode);

console.log('\n=== Generated WGSL Code ===\n');
console.log(wgslCode);

console.log('\n=== Generated WASM Code ===\n');
console.log(wasmCode);

console.log('\n=== Required Inputs ===');
console.log(inputs);