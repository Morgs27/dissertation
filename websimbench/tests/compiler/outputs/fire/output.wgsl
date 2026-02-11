struct Agent {
    id : f32,
    x  : f32,
    y  : f32,
    vx : f32,
    vy : f32,
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
@group(0) @binding(5) var<storage, read> agentsRead : array<Agent>;
@group(0) @binding(6) var<storage, read_write> agentLogs : array<vec2<f32>>;

struct Inputs {
    depositAmount: f32,
    decayFactor: f32,
    riseSpeed: f32,
    spread: f32,
    flickerAmount: f32,
    width: f32,
    height: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;

@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;

@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;

@group(0) @binding(3) var<storage, read> randomValues : array<f32>;




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
        
        // Load random values based on agent.id for parity with JS
        var r = randomValues[u32(agent.id)];
        
        
        y = y - inputs.riseSpeed;
        var drift: f32 = (r - 0.5) * inputs.spread;
        x = x + drift;
        var turnAmount: f32 = (r - 0.5) * inputs.flickerAmount;
        let _ang_t = turnAmount; let _c_t = cos(_ang_t); let _s_t = sin(_ang_t); let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
        _deposit(x, y, inputs.depositAmount);
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agents[i] = agent;
    }
}