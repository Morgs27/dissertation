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
    agentCount: f32,
    depositAmount: f32,
    decayFactor: f32,
    sensorAngle: f32,
    sensorDist: f32,
    turnCos: f32,
    turnSin: f32,
    speed: f32,
    turnAngle: f32,
    width: f32,
    height: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;

@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;

@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;

@group(0) @binding(3) var<storage, read> randomValues : array<f32>;




fn _sense(x: f32, y: f32, vx: f32, vy: f32, angle_offset: f32, dist: f32) -> f32 {
    // Match JS: const currentAngle = f(Math.atan2(vy, vx));
    let angle_cur = atan2(vy, vx);
    
    // Match JS: const angle = f(currentAngle + ao);
    let angle_new = angle_cur + angle_offset;
    
    // Match JS: const sx = f(x + f(f(Math.cos(angle)) * dist));
    let cos_val = cos(angle_new);
    let cos_times_dist = cos_val * dist;
    let sx = x + cos_times_dist;
    
    // Match JS: const sy = f(y + f(f(Math.sin(angle)) * dist));
    let sin_val = sin(angle_new);
    let sin_times_dist = sin_val * dist;
    let sy = y + sin_times_dist;

    let w = inputs.width;
    let h = inputs.height;

    // Wrap coordinates - use i32() which is equivalent to Math.trunc
    var ix = i32(sx);
    var iy = i32(sy);

    if (ix < 0) { ix = ix + i32(w); }
    if (ix >= i32(w)) { ix = ix - i32(w); }
    if (iy < 0) { iy = iy + i32(h); }
    if (iy >= i32(h)) { iy = iy - i32(h); }

    let idx = u32(iy * i32(w) + ix);
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
    let fixed_amount = i32(amount * 1000000.0);
    atomicAdd(& trailMapWrite[idx], fixed_amount);
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
        
        
        var sL: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, inputs.sensorAngle, inputs.sensorDist);
        var sF: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, 0, inputs.sensorDist);
        var sR: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, -inputs.sensorAngle, inputs.sensorDist);
        if (sF < sL && sF < sR) {
            if (r < 0.5) {
                let _c_t = inputs.turnCos; let _s_t = inputs.turnSin; let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
            }
            else if (r >= 0.5) {
                let _c_t = inputs.turnCos; let _s_t = -inputs.turnSin; let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
            }
        }
        if (sL > sR) {
            let _c_t = inputs.turnCos; let _s_t = inputs.turnSin; let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
        }
        if (sR > sL) {
            let _c_t = inputs.turnCos; let _s_t = -inputs.turnSin; let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
        }
        let _dist_mf = inputs.speed; let _dx_mf_t2 = vx * _dist_mf; let _dy_mf_t2 = vy * _dist_mf;  x = x + _dx_mf_t2; y = y + _dy_mf_t2;
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        _deposit(x, y, inputs.depositAmount);
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agents[i] = agent;
    }
}