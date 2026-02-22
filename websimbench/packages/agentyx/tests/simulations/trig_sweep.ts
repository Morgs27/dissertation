export const TRIG_SWEEP_SIMULATION = `
input speed = 1;
var angle = id * 0.01;
turn(angle);
moveForward(inputs.speed);
borderWrapping();
`;
