
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    (global $inputs_riseSpeed (export "inputs_riseSpeed") (mut f32) (f32.const 0))
  (global $inputs_turbulence (export "inputs_turbulence") (mut f32) (f32.const 0))
  (global $inputs_coolingRate (export "inputs_coolingRate") (mut f32) (f32.const 0))
  (global $inputs_height (export "inputs_height") (mut f32) (f32.const 0))
  (global $inputs_width (export "inputs_width") (mut f32) (f32.const 0))
  (global $inputs_debrisChance (export "inputs_debrisChance") (mut f32) (f32.const 0))
    
    
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    (func $random (param $id f32) (param $x f32) (param $y f32) (result f32) (call $random_js))

    

    (global $agent_count (export "agent_count") (mut i32) (i32.const 0))

    (func (export "step") (param $ptr i32)
      (local $x f32) (local $y f32) (local $vx f32) (local $vy f32)
      (local $r f32)
      (local $dx f32)
      (local $_agent_id f32)
      
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))

    ;; load random values
    

    ;; execute DSL
    nop
    (if (f32.eq (local.get $species) (f32.const 0)) (then
    (local.set $y (f32.sub (local.get $y) (f32.const 0.5)))
    (if (f32.ne (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0)) (then
    (local.set $species (f32.const 1))
    ))
    )
    (else (if (f32.eq (local.get $species) (f32.const 1)) (then
    (local.set $y (f32.sub (local.get $y) (global.get $inputs_riseSpeed)))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (call $deposit (local.get $x) (local.get $y) (f32.const 1.0))
    (if (f32.ne (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0)) (then
    (local.set $species (f32.div (f32.div (local.get $2;) ) (local.get $Become) (local.get $smoke)))
    ))))
    )
    (else
    (local.set $y (f32.sub (local.get $y) (f32.mul (global.get $inputs_riseSpeed) (f32.const 0.5))))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)) (f32.const 0.5)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (if (f32.lt (local.get $y) (f32.const 0)) (then
    (local.set $species (f32.div (f32.div (local.get $0;) ) (local.get $Recycle) (local.get $as) (local.get $fuel) (local.get $at) (local.get $bottom)))
    (local.set $y (global.get $inputs_height))
    (local.set $x (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    ))
    ))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))

    ;; store back (species at offset 20 is preserved, not modified)
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
  
    )

    (func (export "step_all") (param $base i32) (param $count i32)
      (local $_outer_i i32) (local $ptr i32) (local $x f32) (local $y f32) (local $vx f32) (local $vy f32)
      (local $r f32)
      (local $dx f32)
      (local $_agent_id f32)
      (local.set $_outer_i (i32.const 0))
      (local.set $ptr (local.get $base))
      (block $exit
        (loop $loop
          (br_if $exit (i32.ge_u (local.get $_outer_i) (local.get $count)))
          
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))

    ;; load random values
    

    ;; execute DSL
    nop
    (if (f32.eq (local.get $species) (f32.const 0)) (then
    (local.set $y (f32.sub (local.get $y) (f32.const 0.5)))
    (if (f32.ne (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0)) (then
    (local.set $species (f32.const 1))
    ))
    )
    (else (if (f32.eq (local.get $species) (f32.const 1)) (then
    (local.set $y (f32.sub (local.get $y) (global.get $inputs_riseSpeed)))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (call $deposit (local.get $x) (local.get $y) (f32.const 1.0))
    (if (f32.ne (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0)) (then
    (local.set $species (f32.div (f32.div (local.get $2;) ) (local.get $Become) (local.get $smoke)))
    ))))
    )
    (else
    (local.set $y (f32.sub (local.get $y) (f32.mul (global.get $inputs_riseSpeed) (f32.const 0.5))))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)) (f32.const 0.5)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (if (f32.lt (local.get $y) (f32.const 0)) (then
    (local.set $species (f32.div (f32.div (local.get $0;) ) (local.get $Recycle) (local.get $as) (local.get $fuel) (local.get $at) (local.get $bottom)))
    (local.set $y (global.get $inputs_height))
    (local.set $x (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    ))
    ))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))

    ;; store back (species at offset 20 is preserved, not modified)
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
  
          (local.set $_outer_i (i32.add (local.get $_outer_i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 24)))
          (br $loop)
        )
      )
    )
  )