import type { Icon } from "@phosphor-icons/react";
import {
  Atom,
  Bird,
  Bug,
  Campfire,
  CloudRain,
  Drop,
  Fish,
  RocketLaunch,
  TrafficSignal,
  UsersThree,
} from "@phosphor-icons/react";

export interface PremadeSimulation {
  code: string;
  description: string;
  icon: Icon;
}

const PREMADE_SIMULATION_CODE: Record<string, string> = {
  Tutorial: `// --- Agentyx DSL Tutorial ---
// This tutorial walks you through the core features of the language.

// 1. INPUTS
// Declare parameters that can be adjusted in real-time.
input accel = 1.05 [1.0, 1.2]; // Factor to "multiply" speed each frame
input maxSpeed = 1.0 [1.0, 10];
input turnAngle = 0.1 [0, 1.0];
input perception = 35 [10, 100];
input depositAmount = 2.0;
input decayFactor = 0.05;

// 2. SPECIES
// Use species to define different behavior groups.
species(2);

// 3. TRAILS & PHEROMONES
enableTrails(inputs.depositAmount, inputs.decayFactor);

// 4. ENVIRONMENT INTERACTION
avoidObstacles(1.2);

// 5. BEHAVIOR LOGIC
if (species == 0) {
    // --- Species 0: "Explorers" ---
    
    var r = random();
    turn((r - 0.5) * inputs.turnAngle);
    
    // We demonstrate "exponential" speed up by multiplying velocity
    // Then we MUST use limitSpeed to keep them under control.
    vx *= inputs.accel;
    vy *= inputs.accel;
    
    // Ensure they don't move too slow initially
    if (vx*vx + vy*vy < 0.1) {
        moveForward(0.5);
    }

    // CAP the speed using the built-in command
    limitSpeed(inputs.maxSpeed);
    
    deposit(inputs.depositAmount);
} 
else {
    // --- Species 1: "Followers" ---
    
    var sL = sense(0.4, 15);
    var sR = sense(-0.4, 15);
    
    if (sL > sR) {
        turn(inputs.turnAngle);
    } else if (sR > sL) {
        turn(-inputs.turnAngle);
    }
    
    moveForward(1.5);

    // CAP the speed using the built-in command
    limitSpeed(inputs.maxSpeed);
}

// 6. NEIGHBOR INTERACTION
var nearby = neighbors(inputs.perception);
foreach (nearby as neighbor) {
    var dx = x - neighbor.x;
    var dy = y - neighbor.y;
    var dist2 = dx*dx + dy*dy;
    
    if (dist2 < 100 && dist2 > 0) {
        vx += dx * 0.05;
        vy += dy * 0.05;
    }
}

// 7. BOUNDARIES & UPDATES
borderWrapping();

// When manipulating vx/vy directly (for acceleration/limitSpeed),
// we call updatePosition() to apply those vectors to the agent's x/y.
updatePosition(1.0);
    `,
  "Slime Mold": `// Slime Mold Simulation
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
  Boids: `// Boids Simulation
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

  Fire: `// Fire Simulation
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

  "Fluid Dispersal": `// Fluid Dispersal Simulation
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

  "Predator-Prey": `// Predator-Prey Simulation
species(2); 
// 0 = Prey
// 1 = Predator

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

  Rain: `// Rain Simulation
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

// Standard wrap for wind
borderWrapping();
`,

  "Multi-Species Boids": `// Multi-Species Boids Simulation
species(3); 
// 0: Aggressive/Fast
// 1: Balanced/Social
// 2: Solitary/Slow

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

  Traffic: `// Traffic Simulation
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
`,

  "Cosmic Web": `// Cosmic Web Simulation
species(5);

// Cyclic Pursuit:
// Species 0 chases 1
// Species 1 chases 2
// Species 2 chases 3
// Species 3 chases 4
// Species 4 chases 0

input perception = 25;
input force = 0.5;
input maxSpeed = 2;
input friction = 0.9;

var nearby = neighbors(inputs.perception);

foreach(nearby) {
    var dx = nearby.x - x;
    var dy = nearby.y - y;
    var dist2 = dx*dx + dy*dy;
    
    if (dist2 > 0 && dist2 < inputs.perception^2) {
        // Check if this neighbor is the target species
        var targetSpecies = (species + 1) % 5;
        
        if (nearby.species == targetSpecies) {
             // Attraction (Chase)
             var dist = sqrt(dist2);
             vx += (dx / dist) * inputs.force;
             vy += (dy / dist) * inputs.force;
        } 
        
        // Separation (Short range) - from everyone to avoid clumping too hard
        if (dist2 < 100) { // dist < 10
             var dist = sqrt(dist2);
             vx -= (dx / dist) * inputs.force * 2.0;
             vy -= (dy / dist) * inputs.force * 2.0;
        }
    }
}

// Friction / Damping
vx *= inputs.friction;
vy *= inputs.friction;

limitSpeed(inputs.maxSpeed);
borderWrapping();
updatePosition(1.0);
`,
};

const PREMADE_SIMULATION_METADATA: Record<
  string,
  Omit<PremadeSimulation, "code">
> = {
  Tutorial: {
    icon: RocketLaunch,
    description:
      "Guided starter that introduces inputs, species, sensing, and trail behavior.",
  },
  "Slime Mold": {
    icon: Bug,
    description:
      "Classic trail-following swarm that grows filament-like emergent paths.",
  },
  Boids: {
    icon: Bird,
    description:
      "Alignment, cohesion, and separation rules for flocking behavior.",
  },
  Fire: {
    icon: Campfire,
    description:
      "Multi-species flames and smoke with rising, cooling, and turbulence.",
  },
  "Fluid Dispersal": {
    icon: Drop,
    description:
      "Particle-style fluid spread with gravity, repulsion, damping, and bounce.",
  },
  "Predator-Prey": {
    icon: Fish,
    description:
      "Two-species ecosystem where prey flock and predators hunt nearby targets.",
  },
  Rain: {
    icon: CloudRain,
    description:
      "Gravity-driven raindrops with wind noise and velocity limiting.",
  },
  "Multi-Species Boids": {
    icon: UsersThree,
    description:
      "Three flock types with distinct speed and interaction traits.",
  },
  Traffic: {
    icon: TrafficSignal,
    description:
      "Lane-like flow model with spacing checks, braking, and acceleration.",
  },
  "Cosmic Web": {
    icon: Atom,
    description:
      "Cyclic pursuit across five species to create web-like cosmic patterns.",
  },
};

export const PREMADE_SIMULATIONS: Record<string, PremadeSimulation> =
  Object.fromEntries(
    Object.entries(PREMADE_SIMULATION_CODE).map(([name, code]) => [
      name,
      {
        code,
        ...PREMADE_SIMULATION_METADATA[name],
      },
    ]),
  );
