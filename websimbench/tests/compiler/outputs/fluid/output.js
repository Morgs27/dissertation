(agent, inputs) => {
                    // Float32 wrapper for precision parity with WASM/WebGPU
                    const f = Math.fround;
                    
                    // Destructure agent properties with Float32 conversion
                    let { id } = agent;
                    let x = f(agent.x);
                    let y = f(agent.y);
                    let vx = f(agent.vx);
                    let vy = f(agent.vy);
                    let species = agent.species || 0;

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

                        // Atomic add to write buffer (Float32)
                        writeMap[iy * w + ix] = f(writeMap[iy * w + ix] + amt);
                    };


                    const _avoidObstacles = (strength) => {
                        const obstacles = inputs.obstacles || [];
                        const str = f(strength || 1);
                        for (let oi = 0; oi < obstacles.length; oi++) {
                            const ob = obstacles[oi];
                            const margin = f(5);
                            const ox1 = f(ob.x - margin);
                            const oy1 = f(ob.y - margin);
                            const ox2 = f(ob.x + ob.w + margin);
                            const oy2 = f(ob.y + ob.h + margin);
                            if (x > ox1 && x < ox2 && y > oy1 && y < oy2) {
                                // Inside obstacle region — push away from center
                                const cx = f(ob.x + f(ob.w * f(0.5)));
                                const cy = f(ob.y + f(ob.h * f(0.5)));
                                let dx = f(x - cx);
                                let dy = f(y - cy);
                                const dist = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
                                if (dist > f(0.001)) {
                                    dx = f(dx / dist);
                                    dy = f(dy / dist);
                                }
                                vx = f(vx + f(dx * str));
                                vy = f(vy + f(dy * str));
                            }
                        }
                    };



        // Execute DSL code
        vy = f(vy + f(inputs.gravity)); 
        let nearby = _neighbors(f(inputs.repulsionRadius)); 
        for (const nearby of nearby) {
            
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
        vx = f(f(f(vx * f(0.9)) / ) / Friction); 
        }
        if (((x <= f(0)) || (x >= f(inputs.width)))) {
    
        vx = f(vx * f(-f(0.8))); 
        }
        x = f(x + f(vx * f(1.0))); y = f(y + f(vy * f(1.0)));

                    // Return updated agent (ensure Float32 values)
                    return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
                } 