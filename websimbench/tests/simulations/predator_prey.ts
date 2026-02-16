export const PREDATOR_PREY_SIMULATION = `
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
`;
