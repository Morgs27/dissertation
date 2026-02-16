struct Agent {
    id : f32,
    x  : f32,
    y  : f32,
    vx : f32,
    vy : f32,
    species : f32,
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
@group(0) @binding(5) var<storage, read> agentsRead : array<Agent>;
@group(0) @binding(6) var<storage, read_write> agentLogs : array<vec2<f32>>;

struct Inputs {
    riseSpeed: f32,
    turbulence: f32,
    coolingRate: f32,
    height: f32,
    width: f32,
    debrisChance: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;

@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;



@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;




fn _sense(x: f32, y: f32, vx: f32, vy: f32, angle_offset: f32, dist: f32) -> f32 {
    let angle_cur = atan2(vy, vx);
    let angle_new = angle_cur + angle_offset;
    let sx = x + cos(angle_new) * dist;
    let sy = y + sin(angle_new) * dist;

    let w = inputs.width;
    let h = inputs.height;
    
    // Wrap coordinates
    var ix = i32(trunc(sx));
    var iy = i32(trunc(sy));
    
    if (ix < 0) { ix += i32(w); }
    if (ix >= i32(w)) { ix -= i32(w); }
    if (iy < 0) { iy += i32(h); }
    if (iy >= i32(h)) { iy -= i32(h); }
    
    let idx = u32(iy * i32(w) + ix);
    // Read from trailMapRead (previous frame state)
    return trailMapRead[idx];
}

fn _deposit(x: f32, y: f32, amount: f32) {
    let w = inputs.width;
    let h = inputs.height;
    
    var ix = i32(trunc(x));
    var iy = i32(trunc(y));
    
    if (ix < 0) { ix += i32(w); }
    if (ix >= i32(w)) { ix -= i32(w); }
    if (iy < 0) { iy += i32(h); }
    if (iy >= i32(h)) { iy -= i32(h); }
    
    let idx = u32(iy * i32(w) + ix);
    // Write to trailMapWrite (deposits for this frame)
    // Use atomic add with fixed-point conversion (x10000) because f32 atomics aren't supported
    // and standard += is racy/divergent on GPU.
    let fixed_amount = i32(amount * 10000.0);
    atomicAdd(&trailMapWrite[idx], fixed_amount);
}


@compute @workgroup_size(64, 1, 1)
fn main(
    @builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>
) {
    let group_index = workgroup_id.x
        + workgroup_id.y * num_workgroups.x
        + workgroup_id.z * num_workgroups.x * num_workgroups.y;
    let i = group_index * 64u + local_id.x;
    if (i < arrayLength(&agents)) {
        var agent = agents[i];
        var x = agent.x;
        var y = agent.y;
        var vx = agent.vx;
        var vy = agent.vy;
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS
        
        
        
        if (species == 0) {
            y = y - 0.5;
            if (randomValues[u32(agent.id)] < 0.1) {
                species = 1.0;
            }
        }
        else {
            if (species == 1) {
                y = y - inputs.riseSpeed;
                var r: f32 = randomValues[u32(agent.id)];
                var dx: f32 = (r - 0.5) * inputs.turbulence;
                x = x + dx;
                _deposit(x, y, 1.0);
                if (randomValues[u32(agent.id)] < inputs.coolingRate) {
                    species = 2.0;
                }
            }
            else {
                y = y - inputs.riseSpeed * 0.5;
                var r: f32 = randomValues[u32(agent.id)];
                var dx: f32 = (r - 0.5) * inputs.turbulence * 0.5;
                x = x + dx;
                if (y < 0) {
                    species = 0.0;
                    y = inputs.height;
                    x = randomValues[u32(agent.id)] * inputs.width;
                }
            }
        }
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        // species is preserved (not modified by DSL code)
        agents[i] = agent;
    }
}