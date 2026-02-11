export const SLIME_SIMULATION = `
input sensorAngle = 0.6;
input sensorDist = 15;
input turnAngle = 0.6;
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
        turn(inputs.turnAngle);
    }
    else if (inputs.r >= 0.5) {
        turn(-inputs.turnAngle);
    }
}

if (sL > sR) {
    turn(inputs.turnAngle);
}

if (sR > sL) {
    turn(-inputs.turnAngle);
}

moveForward(inputs.speed);
borderWrapping();
deposit(inputs.depositAmount);
`;
