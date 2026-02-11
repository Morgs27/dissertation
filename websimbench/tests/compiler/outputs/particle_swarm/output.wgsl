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
    perceptionRadius: f32,
    pullFactor: f32,
    wanderForce: f32,
    dampening: f32,
    maxSpeed: f32,
    dt: f32,
    width: f32,
    height: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;





@group(0) @binding(3) var<storage, read> randomValues : array<f32>;



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
        
        // Find neighbors for nearby
        var nearby_count: u32 = 0u;
        var nearby_sum_x: f32 = 0.0;
        var nearby_sum_y: f32 = 0.0;
        var nearby_sum_vx: f32 = 0.0;
        var nearby_sum_vy: f32 = 0.0;
        for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
            if (_ni == i) { continue; }
            let other = agentsRead[_ni];
            let dx = x - other.x;
            let dy = y - other.y;
            let dist = sqrt(dx*dx + dy*dy);
            if (dist < inputs.perceptionRadius) {
                nearby_count += 1u;
                nearby_sum_x += other.x;
                nearby_sum_y += other.y;
                nearby_sum_vx += other.vx;
                nearby_sum_vy += other.vy;
            }
        }
        if (nearby_count > 0u) {
            var avgX: f32 = 0.0;
            if (nearby_count > 0u) {
                avgX = nearby_sum_x / f32(nearby_count);
            }
            var avgY: f32 = 0.0;
            if (nearby_count > 0u) {
                avgY = nearby_sum_y / f32(nearby_count);
            }
            vx = vx + (avgX - x) * inputs.pullFactor;
            vy = vy + (avgY - y) * inputs.pullFactor;
        }
        var wx: f32 = (r - 0.5) * inputs.wanderForce;
        var wy: f32 = (r - 0.5) * inputs.wanderForce;
        vx = vx + wx;
        vy = vy + wy;
        vx = vx * inputs.dampening;
        vy = vy * inputs.dampening;
        let _spd_ls = inputs.maxSpeed; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }
        if (x < 0.0 || x >= inputs.width) { vx = -vx; } if (y < 0.0 || y >= inputs.height) { vy = -vy; } x = clamp(x, 0.0, inputs.width); y = clamp(y, 0.0, inputs.height);
        let _dt_up = inputs.dt; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        // species is preserved (not modified by DSL code)
        agents[i] = agent;
    }
}