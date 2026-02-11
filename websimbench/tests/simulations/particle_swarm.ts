export const PARTICLE_SWARM_SIMULATION = `
input perceptionRadius = 60;
input pullFactor = 0.005;
input dampening = 0.98;
input maxSpeed = 2;
input wanderForce = 0.3;
input dt = 1;
input r = random();

var nearby = neighbors(inputs.perceptionRadius);

if (nearby.length > 0) {
    var avgX = mean(nearby.x);
    var avgY = mean(nearby.y);
    vx += (avgX - x) * inputs.pullFactor;
    vy += (avgY - y) * inputs.pullFactor;
}

var wx = (inputs.r - 0.5) * inputs.wanderForce;
var wy = (inputs.r - 0.5) * inputs.wanderForce;
vx += wx;
vy += wy;

vx = vx * inputs.dampening;
vy = vy * inputs.dampening;

limitSpeed(inputs.maxSpeed);

borderBounce();

updatePosition(inputs.dt);
`;
