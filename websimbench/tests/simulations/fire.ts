export const FIRE_SIMULATION = `
input riseSpeed = 3;
input spread = 1.5;
input depositAmount = 3.0;
input decayFactor = 0.08;
input flickerAmount = 0.4;
input r = random();

enableTrails(inputs.depositAmount, inputs.decayFactor);

moveUp(inputs.riseSpeed);

var drift = (inputs.r - 0.5) * inputs.spread;
moveRight(drift);

var turnAmount = (inputs.r - 0.5) * inputs.flickerAmount;
turn(turnAmount);

deposit(inputs.depositAmount);

borderWrapping();
`;
