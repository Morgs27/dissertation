(agent, inputs) => {
                    // Float32 wrapper for precision parity with WASM/WebGPU
                    const f = Math.fround;
                    
                    // Destructure agent properties with Float32 conversion
                    let { id } = agent;
                    let x = f(agent.x);
                    let y = f(agent.y);
                    let vx = f(agent.vx);
                    let vy = f(agent.vy);

                    // Get agents array
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

                    // Helper function: calculate mean of an array or array property (returns Float32)
                    const _mean = (arr, prop) => {
                        if (!Array.isArray(arr)) return f(0);
                        if (arr.length === 0) return f(0);
                        if (prop) {
                            // Extract property from each element
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

                    const _sense = (angleOffset, distance) => {
                        // Read from trailMapRead (previous frame state) for order-independent sensing
                        const readMap = inputs.trailMapRead || inputs.trailMap;
                        const ao = f(angleOffset);
                        const dist = f(distance);
                        
                        // angle based on current velocity (Float32 precision)
                        const currentAngle = f(Math.atan2(vy, vx));
                        const angle = f(currentAngle + ao);
                        const sx = f(x + f(f(Math.cos(angle)) * dist));
                        const sy = f(y + f(f(Math.sin(angle)) * dist));
                        // Wrap coordinates - use Math.trunc to match WASM's i32.trunc_f32_s
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
                        // Write to trailMapWrite (new deposits for this frame)
                        const writeMap = inputs.trailMapWrite || inputs.trailMap;
                        if (!writeMap) return;
                        const amt = f(amount);
                        
                        // Use Math.trunc to match WASM's i32.trunc_f32_s
                        let ix = Math.trunc(x);
                        let iy = Math.trunc(y);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;

                        // Emulate GPU fixed-point precision: amount * 1e6 -> i32 -> /1e6
                        // This matches the WGSL atomicAdd with i32 conversion
                        const fixedAmount = Math.trunc(amt * 1000000) / 1000000;
                        writeMap[iy * w + ix] = f(writeMap[iy * w + ix] + f(fixedAmount));
                    };



        // Execute DSL code
        
        let sL = _sense(f(inputs.sensorAngle), f(inputs.sensorDist)); 
        let sF = _sense(f(0), f(inputs.sensorDist)); 
        let sR = _sense(f(-f(inputs.sensorAngle)), f(inputs.sensorDist)); 
        if (((sF < sL) && (sF < sR))) {
    
        if ((r < f(0.5))) {
    
        const __c = f(f(inputs.turnCos)); const __s = f(f(inputs.turnSin)); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
        }
        else if ((r >= f(0.5))) {
        
        const __c = f(f(inputs.turnCos)); const __s = f(f(-f(inputs.turnSin))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
        }
        }
        if ((sL > sR)) {
    
        const __c = f(f(inputs.turnCos)); const __s = f(f(inputs.turnSin)); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
        }
        if ((sR > sL)) {
    
        const __c = f(f(inputs.turnCos)); const __s = f(f(-f(inputs.turnSin))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
        }
        x = f(x + f(vx * f(inputs.speed))); y = f(y + f(vy * f(inputs.speed)));
        if (x < 0) x = f(x + f(inputs.width)); if (x > f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y > f(inputs.height)) y = f(y - f(inputs.height));
        _deposit(f(inputs.depositAmount));

                    // Return updated agent (ensure Float32 values)
                    return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy) };
                } 