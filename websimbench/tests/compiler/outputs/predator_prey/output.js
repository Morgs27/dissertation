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
        
        let nearby = _neighbors(f(inputs.perception)); 
        if ((species == f(0))) {
    
        let avgVx = f(0); 
        let avgX = f(0); 
        let count = f(0); 
        for (const nearby of nearby) {
            
        if ((f(nearby.species) == f(0))) {
    
        avgVx = f(avgVx + f(nearby.vx)); 
        avgX = f(avgX + f(nearby.x)); 
        let dx = f(x - f(nearby.x)); 
        let dy = f(y - f(nearby.y)); 
        let dist2 = f(f(dx * dx) + f(dy * dy)); 
        if ((dist2 < f(100))) {
    
        vx = f(vx + f(dx * f(inputs.preySeparation))); 
        vy = f(vy + f(dy * f(inputs.preySeparation))); 
        }
        count = f(count + f(1)); 
        else {
        let dx = f(x - f(nearby.x)); 
        let dy = f(y - f(nearby.y)); 
        vx = f(vx + f(f(f(dx * f(0.2)) / ) / Strong)); 
        vy = f(vy + f(dy * f(0.2))); 
        }
        }
        if ((count > f(0))) {
    
        avgVx = f(avgVx / count); 
        avgX = f(avgX / count); 
        vx = f(vx + f(f(avgX - x) * f(inputs.preyCohesion))); 
        vy = f(vy + f(f(avgY - y) * f(inputs.preyCohesion))); 
        vx = f(vx + f(f(avgVx - vx) * f(inputs.preyAlignment))); 
        vy = f(vy + f(f(avgVy - vy) * f(inputs.preyAlignment))); 
        }
        const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.preyeSpeed)*f(inputs.preyeSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.preyeSpeed)*f(inputs.preyeSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); };
        }
        else {
        let nearestDist = f(999999); 
        let targetX = f(0); 
        let foundPrey = f(0); 
        for (const nearby of nearby) {
            
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
        else {
        let r = _random(); 
        const __c = f(Math.cos(f(r - f(0.5)))); const __s = f(Math.sin(f(r - f(0.5)))); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;
        }
        const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(f(inputs.predatorSpeed)*f(inputs.predatorSpeed))) { const __scale = f(Math.sqrt(f(f(f(inputs.predatorSpeed)*f(inputs.predatorSpeed)) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); };
        }
        if (x < 0) x = f(x + f(inputs.width)); if (x > f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y > f(inputs.height)) y = f(y - f(inputs.height));
        x = f(x + f(vx * f(1.0))); y = f(y + f(vy * f(1.0)));

                    // Return updated agent (ensure Float32 values)
                    return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
                } 