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
    alignmentFactor: f32,
    cohesionFactor: f32,
    separationDist: f32,
    separationFactor: f32,
    maxSpeed: f32,
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
        
        // Load random values
        
        
        // Find neighbors for nearbyAgents
        var nearbyAgents_count: u32 = 0u;
        var nearbyAgents_sum_x: f32 = 0.0;
        var nearbyAgents_sum_y: f32 = 0.0;
        var nearbyAgents_sum_vx: f32 = 0.0;
        var nearbyAgents_sum_vy: f32 = 0.0;
        for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {
            if (_ni == i) { continue; }
            let other = agentsRead[_ni];
            let dx = agent.x - other.x;
            let dy = agent.y - other.y;
            let dist = sqrt(dx*dx + dy*dy);
            if (dist < inputs.perceptionRadius) {
                nearbyAgents_count += 1u;
                nearbyAgents_sum_x += other.x;
                nearbyAgents_sum_y += other.y;
                nearbyAgents_sum_vx += other.vx;
                nearbyAgents_sum_vy += other.vy;
            }
        }
        agentLogs[i] = vec2<f32>(1.0, /* ERROR: Cannot access nearbyAgents.length directly in WGSL */);
        if (nearbyAgents_count > 0u) {
            var avgVx: f32 = 0.0;
            if (nearbyAgents_count > 0u) {
                avgVx = nearbyAgents_sum_vx / f32(nearbyAgents_count);
            }
            var avgVy: f32 = 0.0;
            if (nearbyAgents_count > 0u) {
                avgVy = nearbyAgents_sum_vy / f32(nearbyAgents_count);
            }
            agent.vx = agent.vx + (avgVx - agent.vx) * inputs.alignmentFactor;
            agent.vy = agent.vy + (avgVy - agent.vy) * inputs.alignmentFactor;
        }
        if (nearbyAgents_count > 0u) {
            var avgX: f32 = 0.0;
            if (nearbyAgents_count > 0u) {
                avgX = nearbyAgents_sum_x / f32(nearbyAgents_count);
            }
            var avgY: f32 = 0.0;
            if (nearbyAgents_count > 0u) {
                avgY = nearbyAgents_sum_y / f32(nearbyAgents_count);
            }
            agent.vx = agent.vx + (avgX - agent.x) * inputs.cohesionFactor;
            agent.vy = agent.vy + (avgY - agent.y) * inputs.cohesionFactor;
        }
        var separationX: f32 = 0;
        var separationY: f32 = 0;
        // Loop over nearbyAgents
        for (var _i_loop: u32 = 0u; _i_loop < arrayLength(&agents); _i_loop++) {
            if (_i_loop == i) { continue; }
            let _loop_other = agents[_i_loop];
            let _loop_dx = agent.x - _loop_other.x;
            let _loop_dy = agent.y - _loop_other.y;
            let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);
            if (_loop_dist >= inputs.perceptionRadius) { continue; }
            // Nearby agent found - execute loop body
            var neighbor_x: f32 = _loop_other.x;
            var neighbor_y: f32 = _loop_other.y;
            var dx: f32 = agent.x - neighbor_x;
            var dy: f32 = agent.y - neighbor_y;
            var dist2: f32 = dx*dx + dy*dy;
            if (dist2 < (inputs.separationDist)*(inputs.separationDist) && dist2 > 0) {
                separationX = separationX + dx / dist2;
                separationY = separationY + dy / dist2;
                agent.vx = agent.vx + separationX * inputs.separationFactor;
                agent.vy = agent.vy + separationY * inputs.separationFactor;
            }
        }
        let _speed2 = agent.vx*agent.vx + agent.vy*agent.vy; if (_speed2 > inputs.maxSpeed*inputs.maxSpeed) { let _scale = sqrt(inputs.maxSpeed*inputs.maxSpeed / _speed2); agent.vx *= _scale; agent.vy *= _scale; }
        if (agent.x < 0) { agent.x += inputs.width; } if (agent.x > inputs.width) { agent.x -= inputs.width; } if (agent.y < 0) { agent.y += inputs.height; } if (agent.y > inputs.height) { agent.y -= inputs.height; }
        agent.x += agent.vx * inputs.dt; agent.y += agent.vy * inputs.dt;
        
        agents[i] = agent;
    }
}