export const PREDATOR_PREY_SIMULATION = `
input perceptionRadius = 50;
input preySpeed = 0.8;
input predatorSpeed = 1.2;
input cohesionFactor = 0.005;
input fleeFactor = 0.03;
input chaseFactor = 0.02;
input separationDist = 15;
input separationFactor = 0.04;
input dt = 1;

var nearby = neighbors(inputs.perceptionRadius);

if (id % 2 == 0) {
    if (nearby.length > 0) {
        var avgX = mean(nearby.x);
        var avgY = mean(nearby.y);
        vx += (avgX - x) * inputs.cohesionFactor;
        vy += (avgY - y) * inputs.cohesionFactor;
    }

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

if (id % 2 == 1) {
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
`;
