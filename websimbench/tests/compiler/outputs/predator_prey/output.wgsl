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
    perceptionRadius: f32,
    cohesionFactor: f32,
    fleeFactor: f32,
    preySpeed: f32,
    chaseFactor: f32,
    separationDist: f32,
    separationFactor: f32,
    predatorSpeed: f32,
    dt: f32,
    width: f32,
    height: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;









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
        if (id % 2 == 0) {
            if (nearby_count > 0u) {
                var avgX: f32 = 0.0;
                if (nearby_count > 0u) {
                    avgX = nearby_sum_x / f32(nearby_count);
                }
                var avgY: f32 = 0.0;
                if (nearby_count > 0u) {
                    avgY = nearby_sum_y / f32(nearby_count);
                }
                vx = vx + (avgX - x) * inputs.cohesionFactor;
                vy = vy + (avgY - y) * inputs.cohesionFactor;
            }
            // Foreach over nearby
            for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
                if (_ni == i) { continue; }
                let _loop_other = agentsRead[_ni];
                let _loop_dx = x - _loop_other.x;
                let _loop_dy = y - _loop_other.y;
                let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
                if (_loop_dist >= inputs.perceptionRadius) { continue; }
                var other_id: f32 = _loop_other.id;
                if (other_id % 2 == 1) {
                    var other_x: f32 = _loop_other.x;
                    var other_y: f32 = _loop_other.y;
                    var dx: f32 = x - other_x;
                    var dy: f32 = y - other_y;
                    vx = vx + dx * inputs.fleeFactor;
                    vy = vy + dy * inputs.fleeFactor;
                }
            }
            let _spd_ls = inputs.preySpeed; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }
        }
        if (id % 2 == 1) {
            // Foreach over nearby
            for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
                if (_ni == i) { continue; }
                let _loop_other = agentsRead[_ni];
                let _loop_dx = x - _loop_other.x;
                let _loop_dy = y - _loop_other.y;
                let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
                if (_loop_dist >= inputs.perceptionRadius) { continue; }
                var other_id: f32 = _loop_other.id;
                if (other_id % 2 == 0) {
                    var other_x: f32 = _loop_other.x;
                    var other_y: f32 = _loop_other.y;
                    var dx: f32 = other_x - x;
                    var dy: f32 = other_y - y;
                    vx = vx + dx * inputs.chaseFactor;
                    vy = vy + dy * inputs.chaseFactor;
                }
            }
            // Foreach over nearby
            for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
                if (_ni == i) { continue; }
                let _loop_other = agentsRead[_ni];
                let _loop_dx = x - _loop_other.x;
                let _loop_dy = y - _loop_other.y;
                let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
                if (_loop_dist >= inputs.perceptionRadius) { continue; }
                var other_id: f32 = _loop_other.id;
                if (other_id % 2 == 1) {
                    var other_x: f32 = _loop_other.x;
                    var other_y: f32 = _loop_other.y;
                    var dx: f32 = x - other_x;
                    var dy: f32 = y - other_y;
                    var dist2: f32 = dx*dx + dy*dy;
                    if (dist2 < (inputs.separationDist)*(inputs.separationDist) && dist2 > 0) {
                        vx = vx + dx / dist2 * inputs.separationFactor;
                        vy = vy + dy / dist2 * inputs.separationFactor;
                    }
                }
            }
            let _spd_ls = inputs.predatorSpeed; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }
        }
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        let _dt_up = inputs.dt; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agents[i] = agent;
    }
}