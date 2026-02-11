
export const PREMADE_SIMULATIONS: Record<string, string> = {
    'Slime Mold': `
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
`,
    'Boids': `
input perceptionRadius = 40; // [0,100]
input alignmentFactor = 0.01; // [0,0.1]
input separationDist = 40; // [0,100]
input separationFactor = 0.06; // [0,0.2]
input maxSpeed = 1; // [0,10]
input cohesionFactor = 0.01; //[0, 0.1]
input dt = 1; // [0, 100]

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
`,

    'Fire': `
input riseSpeed = 3; // [0,10]
input spread = 1.5; // [0,5]
input depositAmount = 3.0; // [0,10]
input decayFactor = 0.08; // [0,0.5]
input flickerAmount = 0.4; // [0,1]
input r = random();

// Trails create a heat glow effect
enableTrails(inputs.depositAmount, inputs.decayFactor);

// Embers rise upward
moveUp(inputs.riseSpeed);

// Random horizontal drift simulates flickering fire
var drift = (inputs.r - 0.5) * inputs.spread;
moveRight(drift);

// Add slight random turn for organic movement
var turnAmount = (inputs.r - 0.5) * inputs.flickerAmount;
turn(turnAmount);

// Deposit heat at current position
deposit(inputs.depositAmount);

// Wrap around so embers recycle from bottom
borderWrapping();
`,

    'Fluid Dispersal': `
input repulsionRadius = 30; // [0,100]
input repulsionForce = 0.08; // [0,0.5]
input dampening = 0.95; // [0,1]
input maxSpeed = 3; // [0,10]
input dt = 1; // [0,10]

// Find nearby particles
var nearby = neighbors(inputs.repulsionRadius);

// Repulsion: push away from nearby particles
foreach (nearby as other) {
  var other_x = other.x;
  var other_y = other.y;
  var dx = x - other_x;
  var dy = y - other_y;
  var dist2 = dx*dx + dy*dy;

  if (dist2 > 0) {
    // Force inversely proportional to distance
    var force = inputs.repulsionForce / dist2;
    vx += dx * force;
    vy += dy * force;
  }
}

// Dampen velocity to prevent explosion
vx = vx * inputs.dampening;
vy = vy * inputs.dampening;

// Limit speed
limitSpeed(inputs.maxSpeed);

// Bounce off boundaries
borderBounce();

// Update position
updatePosition(inputs.dt);
`,

    'Rain': `
input gravity = 9.8;
input r = random();

enableTrails(0, 0.1); 

moveDown(inputs.gravity);

var jitter = (inputs.r - 0.5) * 2;
moveRight(jitter);

borderWrapping();
`,

    'Ant Colony': `
input sensorAngle = 0.5; // [0,3]
input sensorDist = 12; // [0,50]
input turnAngle = 0.3; // [0,1]
input speed = 1.5; // [0,5]
input depositAmount = 1.5; // [0,5]
input decayFactor = 0.02; // [0,0.2]
input wanderAmount = 0.2; // [0,1]
input r = random();

// Pheromone trail system
enableTrails(inputs.depositAmount, inputs.decayFactor);

// Sense pheromone in three directions
var sL = sense(inputs.sensorAngle, inputs.sensorDist);
var sF = sense(0, inputs.sensorDist);
var sR = sense(-inputs.sensorAngle, inputs.sensorDist);

// Follow strongest pheromone trail
if (sF > sL && sF > sR) {
    // Go straight - strongest ahead
}
else if (sL > sR) {
    turn(inputs.turnAngle);
}
else if (sR > sL) {
    turn(-inputs.turnAngle);
}
else {
    // No pheromone - wander randomly
    var wander = (inputs.r - 0.5) * inputs.wanderAmount;
    turn(wander);
}

// Move forward
moveForward(inputs.speed);

// Deposit pheromone at current position
deposit(inputs.depositAmount);

// Wrap around edges
borderWrapping();
`,

    'Predator-Prey': `
input perceptionRadius = 50; // [0,150]
input preySpeed = 0.8; // [0,5]
input predatorSpeed = 1.2; // [0,5]
input cohesionFactor = 0.005; // [0,0.05]
input fleeFactor = 0.03; // [0,0.1]
input chaseFactor = 0.02; // [0,0.1]
input separationDist = 15; // [0,50]
input separationFactor = 0.04; // [0,0.2]
input dt = 1; // [0,10]

// Species determined by agent ID: even = prey, odd = predator
var nearby = neighbors(inputs.perceptionRadius);

// Prey behavior (even IDs)
if (id % 2 == 0) {
    // Cohesion with other prey
    if (nearby.length > 0) {
        var avgX = mean(nearby.x);
        var avgY = mean(nearby.y);
        vx += (avgX - x) * inputs.cohesionFactor;
        vy += (avgY - y) * inputs.cohesionFactor;
    }

    // Flee from predators (odd-ID neighbors)
    foreach (nearby as other) {
        var other_id = other.id;
        if (other_id % 2 == 1) {
            var other_x = other.x;
            var other_y = other.y;
            var dx = x - other_x;
            var dy = y - other_y;
            vx += dx * inputs.fleeFactor;
            vy += dy * inputs.fleeFactor;
        }
    }

    limitSpeed(inputs.preySpeed);
}

// Predator behavior (odd IDs)
if (id % 2 == 1) {
    // Chase nearest prey (even-ID neighbors)
    foreach (nearby as other) {
        var other_id = other.id;
        if (other_id % 2 == 0) {
            var other_x = other.x;
            var other_y = other.y;
            var dx = other_x - x;
            var dy = other_y - y;
            vx += dx * inputs.chaseFactor;
            vy += dy * inputs.chaseFactor;
        }
    }

    // Separation from other predators
    foreach (nearby as other) {
        var other_id = other.id;
        if (other_id % 2 == 1) {
            var other_x = other.x;
            var other_y = other.y;
            var dx = x - other_x;
            var dy = y - other_y;
            var dist2 = dx*dx + dy*dy;
            if (dist2 < inputs.separationDist^2 && dist2 > 0) {
                vx += dx / dist2 * inputs.separationFactor;
                vy += dy / dist2 * inputs.separationFactor;
            }
        }
    }

    limitSpeed(inputs.predatorSpeed);
}

borderWrapping();
updatePosition(inputs.dt);
`,

    'Particle Swarm': `
input perceptionRadius = 60; // [0,150]
input pullFactor = 0.005; // [0,0.05]
input dampening = 0.98; // [0,1]
input maxSpeed = 2; // [0,10]
input wanderForce = 0.3; // [0,2]
input dt = 1; // [0,10]
input r = random();

// Find nearby particles
var nearby = neighbors(inputs.perceptionRadius);

// Steer toward center of local group
if (nearby.length > 0) {
    var avgX = mean(nearby.x);
    var avgY = mean(nearby.y);
    vx += (avgX - x) * inputs.pullFactor;
    vy += (avgY - y) * inputs.pullFactor;
}

// Random exploration force
var wx = (inputs.r - 0.5) * inputs.wanderForce;
var wy = (inputs.r - 0.5) * inputs.wanderForce;
vx += wx;
vy += wy;

// Dampen velocity
vx = vx * inputs.dampening;
vy = vy * inputs.dampening;

// Limit speed
limitSpeed(inputs.maxSpeed);

// Bounce off walls
borderBounce();

// Update position
updatePosition(inputs.dt);
`,

    "Langton's Ant": `
input speed = 5; // [0,20]
input depositAmount = 5.0; // [0,10]
input decayFactor = 0.01; // [0,0.1]
input threshold = 0.5; // [0,5]

// Trail system for cell state
enableTrails(inputs.depositAmount, inputs.decayFactor);

// Sense trail value at current position
var here = sense(0, 0);

// Classic Langton's ant rule:
// On empty cell (low trail): turn right, deposit
// On marked cell (high trail): turn left, don't deposit
if (here < inputs.threshold) {
    turn(-1.5708);
    deposit(inputs.depositAmount);
}
else {
    turn(1.5708);
}

// Move forward
moveForward(inputs.speed);

// Wrap at borders
borderWrapping();
`
};
