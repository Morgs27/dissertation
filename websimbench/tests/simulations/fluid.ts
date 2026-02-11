export const FLUID_SIMULATION = `
input repulsionRadius = 30;
input repulsionForce = 0.08;
input dampening = 0.95;
input maxSpeed = 3;
input dt = 1;

var nearby = neighbors(inputs.repulsionRadius);

foreach (nearby as other) {
  var other_x = other.x;
  var other_y = other.y;
  var dx = x - other_x;
  var dy = y - other_y;
  var dist2 = dx*dx + dy*dy;

  if (dist2 > 0) {
    var force = inputs.repulsionForce / dist2;
    vx += dx * force;
    vy += dy * force;
  }
}

vx = vx * inputs.dampening;
vy = vy * inputs.dampening;

limitSpeed(inputs.maxSpeed);

borderBounce();

updatePosition(inputs.dt);
`;
