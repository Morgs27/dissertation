/**
 * Micro-simulation test fixtures that isolate individual DSL features.
 * These complement the full simulations (boids, slime, etc.) by testing
 * each language construct in isolation.
 */

// ─── Arithmetic ──────────────────────────────────────────────────────

export const ARITHMETIC_TEST = `
var a = 1 + 2 * 3;
var b = a^2;
var c = sqrt(b);
var d = (a + b) / c;
var e = -a;
`;

// ─── Control Flow ────────────────────────────────────────────────────

export const IF_ELSE_TEST = `
if (x > 50) {
    moveRight(1);
}
else {
    moveLeft(1);
}
`;

export const ELSE_IF_TEST = `
if (species == 0) {
    moveUp(1);
} else if (species == 1) {
    moveDown(1);
} else {
    moveRight(1);
}
`;

export const NESTED_IF_TEST = `
if (x > 0) {
    if (y > 0) {
        moveUp(1);
    }
}
`;

export const FOR_LOOP_TEST = `
input perceptionRadius = 40;
var nearbyAgents = neighbors(inputs.perceptionRadius);
var totalX = 0;
for (var i = 0; i < nearbyAgents.length; i++) {
    var nx = nearbyAgents[i].x;
    totalX += nx;
}
`;

export const FOREACH_TEST = `
input perceptionRadius = 40;
var nearbyAgents = neighbors(inputs.perceptionRadius);
foreach (nearbyAgents as neighbor) {
    var dx = x - neighbor.x;
    vx += dx * 0.01;
}
`;

// ─── Commands ────────────────────────────────────────────────────────

export const ALL_MOVEMENT_COMMANDS_TEST = `
moveUp(1);
moveDown(2);
moveLeft(3);
moveRight(4);
`;

export const VELOCITY_COMMANDS_TEST = `
addVelocityX(1);
addVelocityY(2);
setVelocityX(3);
setVelocityY(4);
`;

export const POSITION_COMMANDS_TEST = `
updatePosition(1.0);
borderWrapping();
borderBounce();
limitSpeed(5);
`;

export const TURN_FORWARD_TEST = `
turn(0.5);
moveForward(2);
`;

// ─── Custom Functions ────────────────────────────────────────────────

export const NEIGHBORS_TEST = `
input perceptionRadius = 40;
var nearby = neighbors(inputs.perceptionRadius);
`;

export const MEAN_TEST = `
input perceptionRadius = 40;
var nearby = neighbors(inputs.perceptionRadius);
if (nearby.length > 0) {
    var avgVx = mean(nearby.vx);
    var avgVy = mean(nearby.vy);
}
`;

export const SENSE_DEPOSIT_TEST = `
input sensorAngle = 0.6;
input sensorDist = 15;
input depositAmount = 1.0;
input decayFactor = 0.05;

enableTrails(inputs.depositAmount, inputs.decayFactor);
var s = sense(inputs.sensorAngle, inputs.sensorDist);
deposit(inputs.depositAmount);
`;

export const RANDOM_TEST = `
var r1 = random();
var r2 = random(10);
var r3 = random(1, 5);
`;

// ─── Species ─────────────────────────────────────────────────────────

export const SPECIES_TEST = `
species(3);
if (species == 0) {
    moveUp(1);
} else if (species == 1) {
    moveDown(1);
} else {
    moveRight(1);
}
`;

// ─── Compound Assignments ────────────────────────────────────────────

export const COMPOUND_ASSIGNMENT_TEST = `
vx += 1;
vy -= 2;
vx *= 0.5;
vy /= 2;
`;

// ─── Edge Cases ──────────────────────────────────────────────────────

export const SINGLE_COMMAND_TEST = `
moveUp(1);
`;

export const GRAVITY_ONLY_TEST = `
input gravity = 9.8;
moveDown(inputs.gravity);
`;

// ─── Combined fixture map ────────────────────────────────────────────

export const MICRO_SIMULATIONS: Record<string, string> = {
  arithmetic: ARITHMETIC_TEST,
  if_else: IF_ELSE_TEST,
  else_if: ELSE_IF_TEST,
  nested_if: NESTED_IF_TEST,
  for_loop: FOR_LOOP_TEST,
  foreach: FOREACH_TEST,
  all_movement_commands: ALL_MOVEMENT_COMMANDS_TEST,
  velocity_commands: VELOCITY_COMMANDS_TEST,
  position_commands: POSITION_COMMANDS_TEST,
  turn_forward: TURN_FORWARD_TEST,
  neighbors: NEIGHBORS_TEST,
  mean: MEAN_TEST,
  sense_deposit: SENSE_DEPOSIT_TEST,
  random: RANDOM_TEST,
  species: SPECIES_TEST,
  compound_assignment: COMPOUND_ASSIGNMENT_TEST,
  single_command: SINGLE_COMMAND_TEST,
  gravity_only: GRAVITY_ONLY_TEST,
};
