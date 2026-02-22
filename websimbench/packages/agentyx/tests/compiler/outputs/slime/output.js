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

        // Initialize random input variables (Float32) from indexed randomValues
        let r = f((inputs.randomValues && inputs.randomValues.length >= (id + 1) * 1) ? inputs.randomValues[id * 1 + 0] : Math.random());

                    const _sense = (angleOffset, distance) => {
                        const readMap = inputs.trailMapRead || inputs.trailMap;
                        const ao = f(angleOffset);
                        const dist = f(distance);
                        const currentAngle = f(Math.atan2(vy, vx));
                        const angle = f(currentAngle + ao);
                        const sx = f(x + f(f(Math.cos(angle)) * dist));
                        const sy = f(y + f(f(Math.sin(angle)) * dist));
                        let ix = Math.trunc(sx);
                        let iy = Math.trunc(sy);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;
                        if (readMap) {
                            return f(readMap[iy * w + ix]);
                        }
                        return f(0);
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
  let sL = _sense(f(inputs.sensorAngle), f(inputs.sensorDist)); 
  let sF = _sense(f(0), f(inputs.sensorDist)); 
  let sR = _sense(f(-f(inputs.sensorAngle)), f(inputs.sensorDist)); 
  if (((sF < sL) && (sF < sR))) {
  if ((r < f(0.5))) {
  const __c = f(Math.cos(f(inputs.turnAngle))); const __s = f(Math.sin(f(inputs.turnAngle))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
  }
  else if ((r >= f(0.5))) {
  const __c = f(Math.cos(f(-f(inputs.turnAngle)))); const __s = f(Math.sin(f(-f(inputs.turnAngle)))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
  }
  }
  if ((sL > sR)) {
  const __c = f(Math.cos(f(inputs.turnAngle))); const __s = f(Math.sin(f(inputs.turnAngle))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
  }
  if ((sR > sL)) {
  const __c = f(Math.cos(f(-f(inputs.turnAngle)))); const __s = f(Math.sin(f(-f(inputs.turnAngle)))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
  }
  x = f(x + f(vx * f(inputs.speed))); y = f(y + f(vy * f(inputs.speed)));
  if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));
  _deposit(f(inputs.depositAmount));

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}