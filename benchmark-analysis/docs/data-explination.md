## Basic Sweep

Each simulation was tested with the following setup. The overview.txt in each describes specific runs. 

Used Macbook.
Model Name: MacBook Pro
Model Identifier: Mac16,8
Chip: Apple M4 Pro
Total Number of Cores: 14 (10 performance and 4 efficiency)
Memory: 24 GB
System Firmware Version: 11881.140.96

Chipset Model: Apple M4 Pro
Type: GPU
Bus: Built-In
Total Number of Cores: 20
Vendor: Apple (0x106b)
Metal Support: Metal 3

Used Google Chrome Browser. 
Version 145.0.7632.117 (Official Build) (arm64)

Per Run: 
100 Frames
10 Warmup frames
2 Second cooldown
Plugged into charge
1000ms Sample Interval

Runs:
Agent Counts: 1, 10, 100, 500, 1000, 2000, 5000, 10000, 20000
Methods: JS, WASM, WebGPU, WebWorkers
WebGPU Render Modes: CPU, GPU
Web Worker Counts: 1, 2, 4, 8, 14
WASM: SIMD, Scalar

Agent positions captured for every frame. 

## High Agents

Specific tests for the sims that could handle higher agent counts accross the methods. 

Agent Counts: 50000, 100000, 200000, 500000, 1000000

Same setup as basic sweeps. 

## Mobile Sweeps

Used Google Chrome
Version 145.0.7632.120

Operating System
Android 16; Pixel 9 Pro

Same test config as the basic sweeps. 

## Endurance Tests

All on the same macbook and google chrome as basic sweeps.

10000 agents, 

Timed at 1000 seconds per run. 

Runs explained in overview.txt

## Trig Tests

Ran accross 3 devices. 

Ran with 100 agents for 1000 frames on JS vs WebGPU to test errors in agent positions accross the methods & different devices. 

## GPU Tests

NVIDIA GeForce RTX 4060
CUDA Version: 12.8
Driver Version 570,211,01

Intel Core i5-14500
14 cores - 6 performance, 8 efficient

RAM: 32GB

Google Chrome verstion 145.0.7632.159 (Official Build) (64-bit)


Note: Sometimes the browser can stuggle to bridge the gap between the browser and the GPU drivers. Make sure i.e. in chrom the chrom://flags "Unsafe WebGPU" is enabled. 

## Chromebook

Pixelbook Go - More information to come
