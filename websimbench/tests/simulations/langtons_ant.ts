export const LANGTONS_ANT_SIMULATION = `
input speed = 5;
input depositAmount = 5.0;
input decayFactor = 0.01;
input threshold = 0.5;

enableTrails(inputs.depositAmount, inputs.decayFactor);

var here = sense(0, 0);

if (here < inputs.threshold) {
    turn(-1.5708);
    deposit(inputs.depositAmount);
}
else {
    turn(1.5708);
}

moveForward(inputs.speed);

borderWrapping();
`;
