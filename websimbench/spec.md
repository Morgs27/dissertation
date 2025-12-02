Inside the simulation folder I've got a structure for:
 - Compiling my DSL into different languages
 - Running this code on different compute 'platforms'
 - Rendering this code with different methods

The goal is to benchmark running different complexities of simulations on different platforms. 

You are welcome to expose more methods in the simulation folder and change it to make it more organised / better to work with if needed. 

Boids.ts shows an example program in the DSL
test.txt shows the compiled code
Website.ts shows an example of using the module (not very well though)

I want to now create a frontend with react to use this module. This should be layed out like an online code editor. 

With the following features:
 - Write code in the DSL
 - View the compiled code for each language
 - Ability to run the simulation with a chosen method and view the rendered output
 - Performance pannel showing FPS etc.
 - Ability to run benchmark - when running disable screen
 - Input sliders for each input defined between a range defined on simulation setup
 - Error & Logs pannel for compilation and running - instead of the console.log happening right now (check the logger class)

The idea is the following layout:

Top nav bar with website name - no extra functionallity for now.

- Left side: code editor - with tabs bannor at the top for 'Sim Code', 'WASM', 'Javascript' - anything other than sim code are read only
- Logs + Errors pannel resizable beneath the code editor

- Right side: Canvas output. Input sliders ontop of canvas at bottom. Run button with dropdown for options at the top. 

The name for my project will be WebSimBench

Tech:
 - Use React
 - Use Vite
 - Use React Icons
 - Use TS
 - Use CSS
 - User Chakra UI

User the following colour scheme:

/* CSS HEX */
--jet-black: #1f363dff;
--cerulean: #40798cff;
--tropical-teal: #70a9a1ff;
--muted-teal: #9ec1a3ff;
--tea-green: #cfe0c3ff;