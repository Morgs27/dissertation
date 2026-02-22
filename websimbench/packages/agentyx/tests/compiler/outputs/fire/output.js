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
                    const _NRC = 5;
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

                    const _deposit = (amount) => {
                        const writeMap = inputs.trailMapWrite || inputs.trailMap;
                        if (!writeMap) return;
                        const amt = f(amount);
                        let ix = Math.trunc(x);
                        let iy = Math.trunc(y);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;
                        writeMap[iy * w + ix] = f(writeMap[iy * w + ix] + amt);
                    };

  // Execute DSL code
  if ((species == f(0))) {
  y = f(y - f(0.5));
  if ((_random(f(0)) < f(0.1))) {
  species = f(1); 
  }
  }
  else {
  if ((species == f(1))) {
  y = f(y - f(inputs.riseSpeed));
  let r = _random(1); 
  let dx = f(f(r - f(0.5)) * f(inputs.turbulence)); 
  x = f(x + dx);
  _deposit(f(1.0));
  if ((_random(f(2)) < f(inputs.coolingRate))) {
  species = f(2); 
  }
  }
  else {
  y = f(y - f(f(inputs.riseSpeed) * f(0.5)));
  let r = _random(3); 
  let dx = f(f(f(r - f(0.5)) * f(inputs.turbulence)) * f(0.5)); 
  x = f(x + dx);
  if ((y < f(0))) {
  species = f(0); 
  y = f(inputs.height); 
  x = f(_random(f(4)) * f(inputs.width)); 
  }
  }
  }
  if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}