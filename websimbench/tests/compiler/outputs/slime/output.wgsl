struct Agent {
    id : f32,
    x  : f32,
    y  : f32,
    vx : f32,
    vy : f32,
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
@group(0) @binding(5) var<storage, read> agentsRead : array<Agent>;

struct Inputs {
    depositAmount: f32,
    decayFactor: f32,
    sensorAngle: f32,
    sensorDist: f32,
    turnAngle: f32,
    speed: f32,
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
        
        // Load random values
        var r = randomValues[i];
        
        
        var sL: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, inputs.sensorAngle, inputs.sensorDist);
        var sF: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, 0, inputs.sensorDist);
        var sR: f32 = _sense(agent.x, agent.y, agent.vx, agent.vy, -inputs.sensorAngle, inputs.sensorDist);
        if (sF < sL && sF < sR) {
            if (r < 0.5) {
                let _c = cos(inputs.turnAngle); let _s = sin(inputs.turnAngle); let _vx = agent.vx * _c - agent.vy * _s; agent.vy = agent.vx * _s + agent.vy * _c; agent.vx = _vx;
            }
            else if (r >= 0.5) {
                let _c = cos(-inputs.turnAngle); let _s = sin(-inputs.turnAngle); let _vx = agent.vx * _c - agent.vy * _s; agent.vy = agent.vx * _s + agent.vy * _c; agent.vx = _vx;
            }
        }
        if (sL > sR) {
            let _c = cos(inputs.turnAngle); let _s = sin(inputs.turnAngle); let _vx = agent.vx * _c - agent.vy * _s; agent.vy = agent.vx * _s + agent.vy * _c; agent.vx = _vx;
        }
        if (sR > sL) {
            let _c = cos(-inputs.turnAngle); let _s = sin(-inputs.turnAngle); let _vx = agent.vx * _c - agent.vy * _s; agent.vy = agent.vx * _s + agent.vy * _c; agent.vx = _vx;
        }
        agent.x += agent.vx * inputs.speed; agent.y += agent.vy * inputs.speed;
        if (agent.x < 0) { agent.x += inputs.width; } if (agent.x > inputs.width) { agent.x -= inputs.width; } if (agent.y < 0) { agent.y += inputs.height; } if (agent.y > inputs.height) { agent.y -= inputs.height; }
        _deposit(agent.x, agent.y, inputs.depositAmount);
        
        agents[i] = agent;
    }
}