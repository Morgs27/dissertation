export const TRIG_SENSE_SIMULATION = `
input sensorAngle = 0.6;
input speed = 2;
turn(inputs.sensorAngle);
moveForward(inputs.speed);
borderWrapping();
`;
