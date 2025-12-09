// Re-export all simulations from a single index file
export { BOIDS_SIMULATION } from './boids';
export { SLIME_SIMULATION } from './slime';
export { GRAVITY_SIMULATION } from './gravity';

// Convenient object with all simulations
import { BOIDS_SIMULATION } from './boids';
import { SLIME_SIMULATION } from './slime';
import { GRAVITY_SIMULATION } from './gravity';

export const SIMULATIONS: Record<string, string> = {
    boids: BOIDS_SIMULATION,
    slime: SLIME_SIMULATION,
    gravity: GRAVITY_SIMULATION
};
