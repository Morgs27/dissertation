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
        
        
        
        if (species == 0) {
            y = y - 0.5;
            if (random() {
                species = 1;
            }
        }
        else if (species == 1) {
            y = y - inputs.riseSpeed;
            var r: f32 = random();
            var dx: f32 = (r - 0.5) * inputs.turbulence;
            x = x + dx;
            _deposit(x, y, 1.0);
            if (random() {
                species = 2; // Become smoke;
            }
        }
        else {
            y = y - inputs.riseSpeed * 0.5;
            var r: f32 = random();
            var dx: f32 = (r - 0.5) * inputs.turbulence * 0.5;
            x = x + dx;
            if (y < 0) {
                species = 0; // Recycle as fuel at bottom;
                y = inputs.height;
                x = random() * inputs.width;
            }
        }
        if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        // species is preserved (not modified by DSL code)
        agents[i] = agent;
    }
}