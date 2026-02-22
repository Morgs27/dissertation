(agent, inputs) => {
                    const f = Math.fround;
                    
                    let { id } = agent;
                    let x = f(agent.x);
                    let y = f(agent.y);
                    let vx = f(agent.vx);
                    let vy = f(agent.vy);
                    let species = agent.species || 0;

                    const agents = inputs.agents || [];

                    // Helper function for random values (returns Float32)
                    // callIndex is a compile-time constant assigned to each random() call site
                    const _NRC = 0;
                    const _random = (callIndex, min, max) => {
                        let val;
                        if (inputs.randomValues && inputs.randomValues.length >= (id + 1) * _NRC) {
                            val = f(inputs.randomValues[id * _NRC + callIndex]);
                        } else {
                            val = f(Math.random());
                        }
                        if (max === undefined) {
                            if (min === undefined) return val;
                            return f(val * f(min));
                        }
                        return f(f(min) + f(val * f(f(max) - f(min))));
                    };

                    // Helper function: calculate mean of an array or array property (returns Float32)
                    const _mean = (arr, prop) => {
                        if (!Array.isArray(arr)) return f(0);
                        if (arr.length === 0) return f(0);
                        if (prop) {
                            const values = arr.map(item => f(item[prop] || 0));
                            return f(values.reduce((sum, val) => f(sum + val), f(0)) / f(values.length));
                        }
                        return f(arr.reduce((sum, val) => f(sum + f(val)), f(0)) / f(arr.length));
                    };

                    // Helper function: find nearby neighbors (uses Float32 for distance calc)
                    const _neighbors = (radius) => {
                        const r = f(radius);
                        return agents.filter(a => {
                            if (a.id === id) return false;
                            const dx = f(x - f(a.x));
                            const dy = f(y - f(a.y));
                            const dist = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
                            return dist < r;
                        });
                    };

  // Execute DSL code
  let nearbyAgents = _neighbors(f(inputs.perceptionRadius)); 
  if ((nearbyAgents.length > f(0))) {
  let avgVx = _mean(nearbyAgents, 'vx'); 
  let avgVy = _mean(nearbyAgents, 'vy'); 
  vx = f(vx + f(f(avgVx - vx) * f(inputs.alignmentFactor))); 
  vy = f(vy + f(f(avgVy - vy) * f(inputs.alignmentFactor))); 
  }
  if ((nearbyAgents.length > f(0))) {
  let avgX = _mean(nearbyAgents, 'x'); 
  let avgY = _mean(nearbyAgents, 'y'); 
  vx = f(vx + f(f(avgX - x) * f(inputs.cohesionFactor))); 
  vy = f(vy + f(f(avgY - y) * f(inputs.cohesionFactor))); 
  }
  let separationX = f(0); 
  let separationY = f(0); 
  for (const neighbor of nearbyAgents) {
  let neighbor_x = f(neighbor.x); 
  let neighbor_y = f(neighbor.y); 
  let dx = f(x - neighbor_x); 
  let dy = f(y - neighbor_y); 
  let dist2 = f(f(dx * dx) + f(dy * dy)); 
  if (((dist2 < f(f(inputs.separationDist) * f(inputs.separationDist))) && (dist2 > f(0)))) {
  separationX = f(separationX + f(dx / dist2)); 
  separationY = f(separationY + f(dy / dist2)); 
  vx = f(vx + f(separationX * f(inputs.separationFactor))); 
  vy = f(vy + f(separationY * f(inputs.separationFactor))); 
  }
  }
  const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.maxSpeed)*f(inputs.maxSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.maxSpeed)*f(inputs.maxSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }
  if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));
  x = f(x + f(vx * f(inputs.dt))); y = f(y + f(vy * f(inputs.dt)));

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}