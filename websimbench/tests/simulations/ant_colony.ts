export const ANT_COLONY_SIMULATION = `
input sensorAngle = 0.5;
input sensorDist = 12;
input turnAngle = 0.3;
input speed = 1.5;
input depositAmount = 1.5;
input decayFactor = 0.02;
input wanderAmount = 0.2;
input r = random();

enableTrails(inputs.depositAmount, inputs.decayFactor);

var sL = sense(inputs.sensorAngle, inputs.sensorDist);
var sF = sense(0, inputs.sensorDist);
var sR = sense(-inputs.sensorAngle, inputs.sensorDist);

if (sF > sL && sF > sR) {
}
else if (sL > sR) {
    turn(inputs.turnAngle);
}
else if (sR > sL) {
    turn(-inputs.turnAngle);
}
else {
    var wander = (inputs.r - 0.5) * inputs.wanderAmount;
    turn(wander);
}

moveForward(inputs.speed);

deposit(inputs.depositAmount);

borderWrapping();
`;
