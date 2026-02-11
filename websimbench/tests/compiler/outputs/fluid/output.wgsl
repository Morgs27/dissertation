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
    gravity: f32,
    repulsionRadius: f32,
    repulsionForce: f32,
    damping: f32,
    height: f32,
    width: f32,
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
        
        vy = vy + inputs.gravity;
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
            if (dist < inputs.repulsionRadius) {
                nearby_count += 1u;
                nearby_sum_x += other.x;
                nearby_sum_y += other.y;
                nearby_sum_vx += other.vx;
                nearby_sum_vy += other.vy;
            }
        }
        // Foreach over nearby
        for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
            if (_ni == i) { continue; }
            let _loop_other = agentsRead[_ni];
            let _loop_dx = x - _loop_other.x;
            let _loop_dy = y - _loop_other.y;
            let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
            if (_loop_dist >= inputs.repulsionRadius) { continue; }
            var dx: f32 = x - _loop_other.x;
            var dy: f32 = y - _loop_other.y;
            var dist2: f32 = dx*dx + dy*dy;
            if (dist2 > 0 && dist2 < (inputs.repulsionRadius)*(inputs.repulsionRadius)) {
                var force: f32 = inputs.repulsionForce / (dist2 + 0.1);
                vx = vx + dx * force;
                vy = vy + dy * force;
            }
        }
        vx = vx * inputs.damping;
        vy = vy * inputs.damping;
        if (y >= inputs.height) {
            y = inputs.height - 1;
            vy = vy * -0.8;
            vx = vx * 0.9; // Friction;
        }
        if (x <= 0 || x >= inputs.width) {
            vx = vx * -0.8;
        }
        let _dt_up = 1.0; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        // species is preserved (not modified by DSL code)
        agents[i] = agent;
    }
}