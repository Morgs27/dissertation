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
                    const _random = (min, max) => {
                        if (max === undefined) {
                            if (min === undefined) return f(Math.random());
                            return f(f(Math.random()) * f(min));
                        }
                        return f(f(min) + f(f(Math.random()) * f(f(max) - f(min))));
                    };

        // Initialize random input variables (Float32)
        let r = f((inputs.randomValues && inputs.randomValues[id] !== undefined) ? inputs.randomValues[id] : _random());

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
  vy = f(vy + f(inputs.gravity)); 
  let nearby = _neighbors(f(inputs.repulsionRadius)); 
  for (const _nearby of nearby) {
  const nearby = _nearby;
  let dx = f(x - f(nearby.x)); 
  let dy = f(y - f(nearby.y)); 
  let dist2 = f(f(dx * dx) + f(dy * dy)); 
  if (((dist2 > f(0)) && (dist2 < f(f(inputs.repulsionRadius) * f(inputs.repulsionRadius))))) {
  let force = f(f(inputs.repulsionForce) / f(dist2 + f(0.1))); 
  vx = f(vx + f(dx * force)); 
  vy = f(vy + f(dy * force)); 
  }
  }
  vx = f(vx * f(inputs.damping)); 
  vy = f(vy * f(inputs.damping)); 
  if ((y >= f(inputs.height))) {
  y = f(f(inputs.height) - f(1)); 
  vy = f(vy * f(-f(0.8))); 
  vx = f(vx * f(0.9)); 
  }
  if (((x <= f(0)) || (x >= f(inputs.width)))) {
  vx = f(vx * f(-f(0.8))); 
  }
  x = f(x + f(vx * f(1.0))); y = f(y + f(vy * f(1.0)));

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}