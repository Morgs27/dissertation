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
                    const _NRC = 1;
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
  let nearby = _neighbors(f(inputs.perception)); 
  if ((species == f(0))) {
  let avgVx = f(0); 
  let avgVy = f(0); 
  let avgX = f(0); 
  let avgY = f(0); 
  let count = f(0); 
  for (const _nearby of nearby) {
  const nearby = _nearby;
  if ((f(nearby.species) == f(0))) {
  avgVx = f(avgVx + f(nearby.vx)); 
  avgVy = f(avgVy + f(nearby.vy)); 
  avgX = f(avgX + f(nearby.x)); 
  avgY = f(avgY + f(nearby.y)); 
  let dx = f(x - f(nearby.x)); 
  let dy = f(y - f(nearby.y)); 
  let dist2 = f(f(dx * dx) + f(dy * dy)); 
  if ((dist2 < f(100))) {
  vx = f(vx + f(dx * f(inputs.preySeparation))); 
  vy = f(vy + f(dy * f(inputs.preySeparation))); 
  }
  count = f(count + f(1)); 
  } else {
  let dx = f(x - f(nearby.x)); 
  let dy = f(y - f(nearby.y)); 
  vx = f(vx + f(dx * f(0.2))); 
  vy = f(vy + f(dy * f(0.2))); 
  }
  }
  if ((count > f(0))) {
  avgVx = f(avgVx / count); 
  avgVy = f(avgVy / count); 
  avgX = f(avgX / count); 
  avgY = f(avgY / count); 
  vx = f(vx + f(f(avgX - x) * f(inputs.preyCohesion))); 
  vy = f(vy + f(f(avgY - y) * f(inputs.preyCohesion))); 
  vx = f(vx + f(f(avgVx - vx) * f(inputs.preyAlignment))); 
  vy = f(vy + f(f(avgVy - vy) * f(inputs.preyAlignment))); 
  }
  const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.preyeSpeed)*f(inputs.preyeSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.preyeSpeed)*f(inputs.preyeSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }
  }
  else {
  let nearestDist = f(999999); 
  let targetX = f(0); 
  let targetY = f(0); 
  let foundPrey = f(0); 
  for (const _nearby of nearby) {
  const nearby = _nearby;
  if ((f(nearby.species) == f(0))) {
  let dx = f(f(nearby.x) - x); 
  let dy = f(f(nearby.y) - y); 
  let d2 = f(f(dx * dx) + f(dy * dy)); 
  if ((d2 < nearestDist)) {
  nearestDist = d2; 
  targetX = f(nearby.x); 
  targetY = f(nearby.y); 
  foundPrey = f(1); 
  }
  }
  }
  if (foundPrey) {
  vx = f(vx + f(f(targetX - x) * f(inputs.predatorChasing))); 
  vy = f(vy + f(f(targetY - y) * f(inputs.predatorChasing))); 
  } else {
  let r = _random(0); 
  const __c = f(Math.cos(f(f(r - f(0.5)) * f(0.5)))); const __s = f(Math.sin(f(f(r - f(0.5)) * f(0.5)))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
  }
  const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.predatorSpeed)*f(inputs.predatorSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.predatorSpeed)*f(inputs.predatorSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }
  }
  if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));
  x = f(x + f(vx * f(1.0))); y = f(y + f(vy * f(1.0)));

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}