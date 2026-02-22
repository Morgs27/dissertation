

Review

1. Compiler
    - Error handling
    - Comprehensive tests of different DSL
    - Don't include functions that aren't used
    - Make sure each complation works
2. Compute
3. Simulation Package
4. UI

Features

1. Obstacles
2. Error messages
3. Add input modal
4. Onboarding modal
5. Poster
6. NPM Package
7. Documentation
8. Domain

Bugs




Performance:
1. Track simulation
2. Improve analysis

Prompts: 
1. Make sure the computes are as efficient as possible
2. 


1. Tidy up simulations
2. 


# NPM Module
- Is responsible for taking DSL code, compiling it, running it on specified compute and collecting restults and metrics. 
- Should have main simulation class. Options & ability to feed in new input values each frame as well as obstacles etc. 
- Essentially acts as a way for programmers to avoid the boilerplate of settting up web GPU / WASM / Web Workers etc. While also meaning they don't have to code in bad languages but instead use a nice DSL. 
- Also add a flag to allow users to pass their own JS, WASm or WGSL to run on a compute
- Should take a canvas render for each GPU rendering and JS rendering and handle the rendering. 
- This module should be to industry standard and be well documented and tested. 

# Tracking Module (Part of NPM module)
- Each simulation run with the NPM module should track:
    - Simulation code that is being run & compute & render it's using
    - Simulation paramaters i.e. no. agents, canvas size etc.
    - Agent positions at every frame
    - Compute specific metrics (somewhat being tracked currently) mostly looking at execution time
    - Device metrics (GPU/CPU) & browser metrics & anything that can be fetched from within the browser
    - Output logs from running the simulation


# Websimbench Frontend
- Provides a nice UI IDE for users to write their DSL code, see the compiled code and run the simulation in the playground. 
- Provides a nice UI for changing simulation parameters and viewing results.
- The 

# Benchmark Module (Part of Websimbench Frontend)
- This module will be responsible for running simulations with a variety of parameters. I.e. stepping over agent size, and everything. 
- It will then collect all of the data provided from the Tracking module and store this in a 'report'
- A report should just contain all of the raw data collected from the simulation runs. 
- Forget about graphs and analysis for now. Just provide all of the raw data and allow exporting with some basic data filtering and meta metrics shown on each. 



1. All simulations working
2. Optomise compute's
3. 