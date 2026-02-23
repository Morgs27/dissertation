export const BOIDS_SIMULATION = `
input perceptionRadius = 40 [0, 100];
input alignmentFactor = 0.01 [0, 0.1];
input separationDist = 40 [0, 100];
input separationFactor = 0.06 [0, 0.2];
input maxSpeed = 1 [0, 10];
input cohesionFactor = 0.01 [0, 0.1];
input dt = 1 [0, 100];

// Find nearby neighbors
var nearbyAgents = neighbors(inputs.perceptionRadius);

// Rule 1: Alignment - steer toward average neighbor velocity
if (nearbyAgents.length > 0) {
  var avgVx = mean(nearbyAgents.vx);
  var avgVy = mean(nearbyAgents.vy);
  vx += (avgVx - vx) * inputs.alignmentFactor;
  vy += (avgVy - vy) * inputs.alignmentFactor;
}

// Rule 2: Cohesion - steer toward average neighbor position
if (nearbyAgents.length > 0) {
  var avgX = mean(nearbyAgents.x);
  var avgY = mean(nearbyAgents.y);
  vx += (avgX - x) * inputs.cohesionFactor;
  vy += (avgY - y) * inputs.cohesionFactor;
}

// Rule 3: Separation - avoid getting too close
var separationX = 0;
var separationY = 0;

foreach (nearbyAgents as neighbor) {
  var neighbor_x = neighbor.x;
  var neighbor_y = neighbor.y;
  var dx = x - neighbor_x;
  var dy = y - neighbor_y;
  var dist2 = dx*dx + dy*dy;

  if (dist2 < inputs.separationDist^2 && dist2 > 0) {
    separationX += dx / dist2;
    separationY += dy / dist2;
    vx += separationX * inputs.separationFactor;
    vy += separationY * inputs.separationFactor;
  }
}

// Rule 4: Speed limiting
limitSpeed(inputs.maxSpeed);

// Rule 5: Border wrapping
borderWrapping()

// Update position based on velocity
updatePosition(inputs.dt);
`;
