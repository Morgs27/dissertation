// Re-export all simulations from a single index file
export { BOIDS_SIMULATION } from "./boids";
export { SLIME_SIMULATION } from "./slime";
export { GRAVITY_SIMULATION } from "./gravity";
export { FIRE_SIMULATION } from "./fire";
export { FLUID_SIMULATION } from "./fluid";
export { PREDATOR_PREY_SIMULATION } from "./predator_prey";
export { OBSTACLES_SIMULATION } from "./obstacles";
export { TRIG_BASIC_SIMULATION } from "./trig_basic";
export { TRIG_SWEEP_SIMULATION } from "./trig_sweep";
export { TRIG_SENSE_SIMULATION } from "./trig_sense";

// Convenient object with all simulations
import { BOIDS_SIMULATION } from "./boids";
import { SLIME_SIMULATION } from "./slime";
import { GRAVITY_SIMULATION } from "./gravity";
import { FIRE_SIMULATION } from "./fire";
import { FLUID_SIMULATION } from "./fluid";
import { PREDATOR_PREY_SIMULATION } from "./predator_prey";
import { OBSTACLES_SIMULATION } from "./obstacles";
import { TRIG_BASIC_SIMULATION } from "./trig_basic";
import { TRIG_SWEEP_SIMULATION } from "./trig_sweep";
import { TRIG_SENSE_SIMULATION } from "./trig_sense";

export const SIMULATIONS: Record<string, string> = {
  boids: BOIDS_SIMULATION,
  slime: SLIME_SIMULATION,
  gravity: GRAVITY_SIMULATION,
  fire: FIRE_SIMULATION,
  fluid: FLUID_SIMULATION,
  predator_prey: PREDATOR_PREY_SIMULATION,
  obstacles: OBSTACLES_SIMULATION,
  trig_basic: TRIG_BASIC_SIMULATION,
  trig_sweep: TRIG_SWEEP_SIMULATION,
  trig_sense: TRIG_SENSE_SIMULATION,
};
