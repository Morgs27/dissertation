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
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS (indexed by stride)
        
        
        y = y + inputs.gravity;
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        agents[i] = agent;
    }
}