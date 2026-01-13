export const SLIME_SIMULATION = `
input sensorAngle = 0.6;
input sensorDist = 15;
input turnAngle = 0.6;
input turnCos = 0.8253356149096783;
input turnSin = 0.5646424733950354;
input speed = 2;
input depositAmount = 2.0;
input decayFactor = 0.05; 
input r = random();

enableTrails(inputs.depositAmount, inputs.decayFactor);

var sL = sense(inputs.sensorAngle, inputs.sensorDist);
var sF = sense(0, inputs.sensorDist);
var sR = sense(-inputs.sensorAngle, inputs.sensorDist);

if (sF < sL && sF < sR) {
    if (inputs.r < 0.5) {
        turnPrecomputed(inputs.turnCos, inputs.turnSin);
    }
    else if (inputs.r >= 0.5) {
        turnPrecomputed(inputs.turnCos, -inputs.turnSin);
    }
}

if (sL > sR) {
    turnPrecomputed(inputs.turnCos, inputs.turnSin);
}

if (sR > sL) {
    turnPrecomputed(inputs.turnCos, -inputs.turnSin);
}

moveForward(inputs.speed);
borderWrapping();
deposit(inputs.depositAmount);
`;
