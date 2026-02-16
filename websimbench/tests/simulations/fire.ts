export const FIRE_SIMULATION = `
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
else {
    if (species == 1) {
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
}

// Global wrap
borderWrapping();
`;
