
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
`,

    'Fire': `
species(3); 
// 0 = Fuel/Base
// 1 = Active Fire
// 2 = Smoke/Ash

input riseSpeed = 3.5;
input turbulence = 0.8;
input coolingRate = 0.05;
input debrisChance = 0.02;

// Species behavior
if (species == 0) {
    // Fuel: stationary or slowly rising
    moveUp(0.5);
    
    // Chance to catch fire (become species 1)
    if (random() < 0.1) {
        species = 1;
    }
}
else if (species == 1) {
    // Active Fire: fast rising, turbulent
    moveUp(inputs.riseSpeed);
    
    // Turbulence
    var r = random();
    var dx = (r - 0.5) * inputs.turbulence;
    moveRight(dx);
    
    // Emit light/heat trail
    deposit(1.0);
    
    // Cooling process
    if (random() < inputs.coolingRate) {
        species = 2; // Become smoke
    }
}
else {
    // Smoke: slower rising, fading
    moveUp(inputs.riseSpeed * 0.5);
    
    // Drifting
    var r = random();
    var dx = (r - 0.5) * inputs.turbulence * 0.5;
    moveRight(dx);
    
    // Chance to re-ignite if near fire? Or just recycle
    if (y < 0) {
        species = 0; // Recycle as fuel at bottom
        y = inputs.height;
        x = random() * inputs.width;
    }
}

// Global wrap
borderWrapping();
`,

    'Fluid Dispersal': `
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
`,

    'Predator-Prey': `
species(2); 
// 0 = Prey (Green-ish)
// 1 = Predator (Red-ish)

input preyCohesion = 0.08;
input preySeparation = 0.15;
input preyAlignment = 0.05;
input preyeSpeed = 2.0;
input predatorChasing = 0.06;
input predatorSpeed = 2.3;
input perception = 40;

var nearby = neighbors(inputs.perception);

if (species == 0) {
    // --- PREY BEHAVIOR ---
    
    // Flocking (Alignment, Cohesion, Separation)
    var avgVx = 0;
    var avgVy = 0;
    var avgX = 0;
    var avgY = 0;
    var count = 0;
    
    foreach(nearby) {
        if (nearby.species == 0) {
            // Friendly neighbor - flock
            avgVx += nearby.vx; avgVy += nearby.vy;
            avgX += nearby.x; avgY += nearby.y;
            
            // Separation
            var dx = x - nearby.x;
            var dy = y - nearby.y;
            var dist2 = dx*dx + dy*dy;
            if (dist2 < 100) { // overly close
                vx += dx * inputs.preySeparation;
                vy += dy * inputs.preySeparation;
            }
            count += 1;
        } else {
            // Predator! Flee!
            var dx = x - nearby.x;
            var dy = y - nearby.y;
            vx += dx * 0.2; // Strong flee force
            vy += dy * 0.2;
        }
    }
    
    if (count > 0) {
        avgVx /= count; avgVy /= count;
        avgX /= count; avgY /= count;
        
        // Cohesion
        vx += (avgX - x) * inputs.preyCohesion;
        vy += (avgY - y) * inputs.preyCohesion;
        
        // Alignment
        vx += (avgVx - vx) * inputs.preyAlignment;
        vy += (avgVy - vy) * inputs.preyAlignment;
    }
    
    limitSpeed(inputs.preyeSpeed);
} 
else {
    // --- PREDATOR BEHAVIOR ---
    
    // Chase nearest prey
    var nearestDist = 999999;
    var targetX = 0;
    var targetY = 0;
    var foundPrey = 0;
    
    foreach(nearby) {
        if (nearby.species == 0) {
            var dx = nearby.x - x;
            var dy = nearby.y - y;
            var d2 = dx*dx + dy*dy;
            if (d2 < nearestDist) {
                nearestDist = d2;
                targetX = nearby.x;
                targetY = nearby.y;
                foundPrey = 1;
            }
        }
    }
    
    if (foundPrey) {
        // Move towards target
        vx += (targetX - x) * inputs.predatorChasing;
        vy += (targetY - y) * inputs.predatorChasing;
    } else {
        // Wander if no prey visible
        var r = random();
        turn((r - 0.5) * 0.5);
    }
    
    limitSpeed(inputs.predatorSpeed);
}

borderWrapping();
updatePosition(1.0);
`,

    'Rain': `
input gravity = 0.5;
input wind = 0.1;
input terminalVelocity = 10;
input resetY = 0;

// Apply gravity
vy += inputs.gravity;

// Apply wind with some noise
var r = random();
vx += inputs.wind + (r - 0.5) * 0.2;

// Limit speed
limitSpeed(inputs.terminalVelocity);

// Move
updatePosition(1.0);

// Reset if at bottom (rain recycling)
if (y >= inputs.height) {
    y = 0;
    x = random() * inputs.width;
    vy = 2; // Initial fall speed
    vx = 0; // Reset horizontal
}

// Standard wrap for wind
borderWrapping();
`,

    'Multi-Species Boids': `
species(3); 
// 0: Red - Aggressive/Fast
// 1: Green - Balanced/Social
// 2: Blue - Solitary/Slow

input perception = 40;
input separationVal = 0.5;
input cohesionVal = 0.05;
input alignVal = 0.05;
input maxSpeed = 2;

var nearby = neighbors(inputs.perception);
var avgX = 0;
var avgY = 0;
var avgVx = 0;
var avgVy = 0;
var count = 0;

foreach(nearby) {
    var dx = x - nearby.x;
    var dy = y - nearby.y;
    var dist2 = dx*dx + dy*dy;
    
    // Separation from everyone (avoid collisions)
    if (dist2 < 100 && dist2 > 0) {
        vx += dx * inputs.separationVal;
        vy += dy * inputs.separationVal;
    }

    // Species-specific behavior
    if (species == nearby.species) {
        // Cohesion/Alignment with own kind
        avgX += nearby.x;
        avgY += nearby.y;
        avgVx += nearby.vx;
        avgVy += nearby.vy;
        count += 1;
    } else {
        // Avoid other species slightly
        if (dist2 < 400) {
            vx += dx * 0.1;
            vy += dy * 0.1;
        }
    }
}

if (count > 0) {
    avgX /= count; avgY /= count;
    avgVx /= count; avgVy /= count;
    
    // Apply flocking forces
    vx += (avgX - x) * inputs.cohesionVal;
    vy += (avgY - y) * inputs.cohesionVal;
    vx += (avgVx - vx) * inputs.alignVal;
    vy += (avgVy - vy) * inputs.alignVal;
}

// Species quirks
if (species == 0) {
    limitSpeed(inputs.maxSpeed * 1.5); // Fast
} else if (species == 2) {
    limitSpeed(inputs.maxSpeed * 0.7); // Slow
    // Solitary wandering
    var r = random();
    turn((r-0.5) * 0.2);
} else {
    limitSpeed(inputs.maxSpeed); // Normal
}

borderWrapping();
updatePosition(1.0);
`,

    'Traffic': `
input vision = 60;
input pspace = 15;
input maxSpeed = 3;

var nearby = neighbors(inputs.vision);
var closestDist = 9999;

foreach(nearby) {
    var dx = nearby.x - x;
    var dy = nearby.y - y;

    // Only interact with cars in front
    if (dx > 0 && dx < inputs.vision && dy*dy < 100) {
        if (dx < closestDist) {
            closestDist = dx;
        }
    }
}

if (closestDist < inputs.pspace) {
    // Brake hard if too close
    vx *= 0.8;
} else {
    // Clear road
    
    // Random braking (human error)
    if (random() < 0.1) {
        vx *= 0.9;
    } else {
        // Accelerate
        vx += 0.05;
    }
}

// Keep in lane (dampen Y)
vy *= 0.8;

// Keep moving right
if (vx < 0.5) vx = 0.5;

limitSpeed(inputs.maxSpeed);
borderWrapping();
updatePosition(1.0);
`
};
