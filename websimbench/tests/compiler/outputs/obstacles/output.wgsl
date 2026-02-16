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
    speed: f32,
    avoidStrength: f32,
    obstacleCount: f32,
    width: f32,
    height: f32,
};

@group(0) @binding(1) var<uniform> inputs: Inputs;







@group(0) @binding(7) var<storage, read> obstacles : array<Obstacle>;



struct Obstacle {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

fn _avoidObstacles(strength: f32, px: ptr<function, f32>, py: ptr<function, f32>, pvx: ptr<function, f32>, pvy: ptr<function, f32>) {
    let x_val = *px;
    let y_val = *py;
    var vx_val = *pvx;
    var vy_val = *pvy;
    let obs_count = u32(inputs.obstacleCount);
    let str = strength;
    let margin: f32 = 5.0;
    
    for (var oi: u32 = 0u; oi < obs_count; oi++) {
        let ob = obstacles[oi];
        let ox1 = ob.x - margin;
        let oy1 = ob.y - margin;
        let ox2 = ob.x + ob.w + margin;
        let oy2 = ob.y + ob.h + margin;
        
        if (x_val > ox1 && x_val < ox2 && y_val > oy1 && y_val < oy2) {
            let cx = ob.x + ob.w * 0.5;
            let cy = ob.y + ob.h * 0.5;
            var dx = x_val - cx;
            var dy = y_val - cy;
            let dist = sqrt(dx * dx + dy * dy);
            if (dist > 0.001) {
                dx = dx / dist;
                dy = dy / dist;
            }
            vx_val = vx_val + dx * str;
            vy_val = vy_val + dy * str;
        }
    }
    
    *pvx = vx_val;
    *pvy = vy_val;
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
        var id = agent.id;
        var x = agent.x;
        var y = agent.y;
        var vx = agent.vx;
        var vy = agent.vy;
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS (indexed by stride)
        
        
        y = y + inputs.speed;
        _avoidObstacles(inputs.avoidStrength, &x, &y, &vx, &vy);
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        agents[i] = agent;
    }
}