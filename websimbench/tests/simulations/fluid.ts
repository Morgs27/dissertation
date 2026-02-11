export const FLUID_SIMULATION = `
input gravity = 0.1;
input repulsionRadius = 15;
input repulsionForce = 0.5;
input damping = 0.96;
input r = random();

// Apply gravity
vy += inputs.gravity;

// SPH-like repulsion (simulating pressure)
var nearby = neighbors(inputs.repulsionRadius);
foreach(nearby) {
    var dx = x - nearby.x;
    var dy = y - nearby.y;
    var dist2 = dx*dx + dy*dy;
    
    if (dist2 > 0 && dist2 < inputs.repulsionRadius^2) {
        var force = inputs.repulsionForce / (dist2 + 0.1);
        vx += dx * force;
        vy += dy * force;
    }
}

// Apply damping (viscosity)
vx *= inputs.damping;
vy *= inputs.damping;

// Boundary handling with bounce
if (y >= inputs.height) {
    y = inputs.height - 1;
    vy *= -0.8;
    vx *= 0.9; // Friction
}
if (x <= 0 || x >= inputs.width) {
    vx *= -0.8;
}

updatePosition(1.0);
`;
