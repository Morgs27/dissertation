// Re-export all simulations from a single index file
export { BOIDS_SIMULATION } from './boids';
export { SLIME_SIMULATION } from './slime';
export { GRAVITY_SIMULATION } from './gravity';
export { FIRE_SIMULATION } from './fire';
export { FLUID_SIMULATION } from './fluid';
export { ANT_COLONY_SIMULATION } from './ant_colony';
export { PREDATOR_PREY_SIMULATION } from './predator_prey';
export { PARTICLE_SWARM_SIMULATION } from './particle_swarm';
export { LANGTONS_ANT_SIMULATION } from './langtons_ant';

// Convenient object with all simulations
import { BOIDS_SIMULATION } from './boids';
import { SLIME_SIMULATION } from './slime';
import { GRAVITY_SIMULATION } from './gravity';
import { FIRE_SIMULATION } from './fire';
import { FLUID_SIMULATION } from './fluid';
import { ANT_COLONY_SIMULATION } from './ant_colony';
import { PREDATOR_PREY_SIMULATION } from './predator_prey';
import { PARTICLE_SWARM_SIMULATION } from './particle_swarm';
import { LANGTONS_ANT_SIMULATION } from './langtons_ant';

export const SIMULATIONS: Record<string, string> = {
    boids: BOIDS_SIMULATION,
    slime: SLIME_SIMULATION,
    gravity: GRAVITY_SIMULATION,
    fire: FIRE_SIMULATION,
    fluid: FLUID_SIMULATION,
    ant_colony: ANT_COLONY_SIMULATION,
    predator_prey: PREDATOR_PREY_SIMULATION,
    particle_swarm: PARTICLE_SWARM_SIMULATION,
    langtons_ant: LANGTONS_ANT_SIMULATION,
};
