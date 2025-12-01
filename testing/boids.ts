export const boidsDSL = `
// Boids flocking simulation

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

for (var i = 0; i < nearbyAgents.length; i++) {
  var neighbor_x = nearbyAgents[i].x;
  var neighbor_y = nearbyAgents[i].y;
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
// Note: borderWrapping() implicitly uses inputs.width and inputs.height
// We reference them here to ensure they're extracted as inputs
var _boundary_width = inputs.width;
var _boundary_height = inputs.height;
borderWrapping();

// Update position based on velocity
updatePosition(inputs.dt);
`;

