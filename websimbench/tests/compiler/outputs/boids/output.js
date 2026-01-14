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
        const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.maxSpeed)*f(inputs.maxSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.maxSpeed)*f(inputs.maxSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); };
        if (x < 0) x = f(x + f(inputs.width)); if (x > f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y > f(inputs.height)) y = f(y - f(inputs.height));
        x = f(x + f(vx * f(inputs.dt))); y = f(y + f(vy * f(inputs.dt)));

                    // Return updated agent (ensure Float32 values)
                    return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy) };
                } 