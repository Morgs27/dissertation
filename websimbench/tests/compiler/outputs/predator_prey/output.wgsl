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
    perception: f32,
    preySeparation: f32,
    preyCohesion: f32,
    preyAlignment: f32,
    preyeSpeed: f32,
    predatorChasing: f32,
    predatorSpeed: f32,
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
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS (indexed by stride)
        
        
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
        if (dist < inputs.perception) {
        nearby_count += 1u;
        nearby_sum_x += other.x;
        nearby_sum_y += other.y;
        nearby_sum_vx += other.vx;
        nearby_sum_vy += other.vy;
        }
        }
        if (species == 0) {
        var avgVx: f32 = 0.0;
        var avgVy: f32 = 0.0;
        var avgX: f32 = 0.0;
        var avgY: f32 = 0.0;
        var count: f32 = 0.0;
        // Foreach over nearby
        for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
        if (_ni == i) { continue; }
        let _loop_other = agentsRead[_ni];
        let _loop_dx = x - _loop_other.x;
        let _loop_dy = y - _loop_other.y;
        let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
        if (_loop_dist >= inputs.perception) { continue; }
        if (_loop_other.species == 0) {
        avgVx = avgVx + _loop_other.vx;
        avgVy = avgVy + _loop_other.vy;
        avgX = avgX + _loop_other.x;
        avgY = avgY + _loop_other.y;
        var dx: f32 = x - _loop_other.x;
        var dy: f32 = y - _loop_other.y;
        var dist2: f32 = dx*dx + dy*dy;
        if (dist2 < 100) {
        vx = vx + dx * inputs.preySeparation;
        vy = vy + dy * inputs.preySeparation;
        }
        count = count + 1;
        } else {
        var dx: f32 = x - _loop_other.x;
        var dy: f32 = y - _loop_other.y;
        vx = vx + dx * 0.2;
        vy = vy + dy * 0.2;
        }
        }
        if (count > 0) {
        avgVx = avgVx / count;
        avgVy = avgVy / count;
        avgX = avgX / count;
        avgY = avgY / count;
        vx = vx + (avgX - x) * inputs.preyCohesion;
        vy = vy + (avgY - y) * inputs.preyCohesion;
        vx = vx + (avgVx - vx) * inputs.preyAlignment;
        vy = vy + (avgVy - vy) * inputs.preyAlignment;
        }
        let _spd_ls = inputs.preyeSpeed; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }
        }
        else {
        var nearestDist: f32 = 999999.0;
        var targetX: f32 = 0.0;
        var targetY: f32 = 0.0;
        var foundPrey: f32 = 0.0;
        // Foreach over nearby
        for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
        if (_ni == i) { continue; }
        let _loop_other = agentsRead[_ni];
        let _loop_dx = x - _loop_other.x;
        let _loop_dy = y - _loop_other.y;
        let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
        if (_loop_dist >= inputs.perception) { continue; }
        if (_loop_other.species == 0) {
        var dx: f32 = _loop_other.x - x;
        var dy: f32 = _loop_other.y - y;
        var d2: f32 = dx*dx + dy*dy;
        if (d2 < nearestDist) {
        nearestDist = d2;
        targetX = _loop_other.x;
        targetY = _loop_other.y;
        foundPrey = 1.0;
        }
        }
        }
        if (foundPrey != 0.0) {
        vx = vx + (targetX - x) * inputs.predatorChasing;
        vy = vy + (targetY - y) * inputs.predatorChasing;
        } else {
        var r: f32 = randomValues[u32(agent.id) * 1u + 0u];
        let _ang_t = (r - 0.5) * 0.5; let _c_t = cos(_ang_t); let _s_t = sin(_ang_t); let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;
        }
        let _spd_ls = inputs.predatorSpeed; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }
        }
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        let _dt_up = 1.0; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        agents[i] = agent;
    }
}