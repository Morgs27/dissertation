
The goal. Create both and NPM package and a website that wraps it. The NPM package should be usable independently of the website so users can achieve quick and easy access to running 2d Agent based simulations in the web. 

The code should be industry standard for deployment. I will tackle documentation afterwards. 


# NPM Module - agentyx
- Is responsible for taking DSL code, compiling it, running it on specified compute and collecting restults and metrics. 
- Should have main simulation class. Options & ability to feed in new input values each frame as well as obstacles etc. 
- Essentially acts as a way for programmers to avoid the boilerplate of settting up web GPU / WASM / Web Workers etc. While also meaning they don't have to code in bad languages but instead use a nice DSL. 
- Also add a flag to allow users to pass their own JS, WASm or WGSL to run on a compute
- Should take a canvas render for each GPU rendering and JS rendering and handle the rendering. 
- This module should be to industry standard and be well documented and tested. 

### Tracking Module (Part of NPM module)
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

### Benchmark Module (Part of Websimbench Frontend)
- This module will be responsible for running simulations with a variety of parameters. I.e. stepping over agent size, and everything. 
- It will then collect all of the data provided from the Tracking module and store this in a 'report'
- A report should just contain all of the raw data collected from the simulation runs. 
- Forget about graphs and analysis for now. Just provide all of the raw data and allow exporting with some basic data filtering and meta metrics shown on each. 


# Current Codebase
- Somewhat seperates the simulation module from the frontend. This should be properly seperated. 
- The NPM module should be ready to be published. 
- Move all tests to the NPM module area, and standardise a proper set for each stage of the pipeline. 
- Remove the frontend compare tab, I will compare error by downloading the simulation json data. 
- Rework the frontend benchmark tab to allow for more customisation and complete control over stepping over things for runs.
- Make sure the NPM module logs well and provides useful erros. 