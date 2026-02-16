export const OBSTACLES_SIMULATION = `
input speed = 1.5;
input avoidStrength = 3.0;

// Simple movement + obstacle avoidance
moveDown(inputs.speed);
avoidObstacles(inputs.avoidStrength);
borderWrapping();
`;
