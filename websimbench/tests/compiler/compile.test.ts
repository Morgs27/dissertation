import { describe, it, expect } from 'vitest';
import { server } from 'vitest/browser';
import { Compiler } from '../../src/simulation/compiler/compiler';
import { SIMULATIONS } from '../simulations';

describe('Compiler Tests', () => {
    for (const [simulationName, sourceCode] of Object.entries(SIMULATIONS)) {
        it(`should compile ${simulationName} simulation`, async () => {
            const compiler = new Compiler();
            const result = compiler.compileAgentCode(sourceCode);

            // Assertions
            expect(result).toBeDefined();
            expect(result.jsCode).toBeDefined();
            expect(result.wgslCode).toBeDefined();
            expect(result.WASMCode).toBeDefined();

            // Write outputs using Vitest server commands
            await server.commands.writeFile(
                `tests/compiler/outputs/${simulationName}/output.js`,
                result.jsCode
            );
            await server.commands.writeFile(
                `tests/compiler/outputs/${simulationName}/output.wgsl`,
                result.wgslCode
            );
            await server.commands.writeFile(
                `tests/compiler/outputs/${simulationName}/output.wat`,
                result.WASMCode
            );
        });
    }
});
