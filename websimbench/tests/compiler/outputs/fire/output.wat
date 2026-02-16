
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
    (global $trailMapReadPtr (export "trailMapReadPtr") (mut i32) (i32.const 0))
    (global $trailMapWritePtr (export "trailMapWritePtr") (mut i32) (i32.const 0))
    
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    (func $random (param $id f32) (param $x f32) (param $y f32) (result f32) (call $random_js))

    
    (func $sense (param $x f32) (param $y f32) (param $vx f32) (param $vy f32) (param $angleOffset f32) (param $dist f32) (result f32)
      (local $angle f32) (local $sx f32) (local $sy f32) (local $ix i32) (local $iy i32) (local $w i32) (local $h i32) (local $idx i32)
      (local.set $w (i32.trunc_f32_s (global.get $inputs_width)))
      (local.set $h (i32.trunc_f32_s (global.get $inputs_height)))
      (local.set $angle (f32.add (call $atan2 (local.get $vy) (local.get $vx)) (local.get $angleOffset)))
      (local.set $sx (f32.add (local.get $x) (f32.mul (call $cos (local.get $angle)) (local.get $dist))))
      (local.set $sy (f32.add (local.get $y) (f32.mul (call $sin (local.get $angle)) (local.get $dist))))
      (local.set $ix (i32.trunc_f32_s (local.get $sx)))
      (local.set $iy (i32.trunc_f32_s (local.get $sy)))
      (if (i32.lt_s (local.get $ix) (i32.const 0)) (then (local.set $ix (i32.add (local.get $ix) (local.get $w)))))
      (if (i32.ge_s (local.get $ix) (local.get $w)) (then (local.set $ix (i32.sub (local.get $ix) (local.get $w)))))
      (if (i32.lt_s (local.get $iy) (i32.const 0)) (then (local.set $iy (i32.add (local.get $iy) (local.get $h)))))
      (if (i32.ge_s (local.get $iy) (local.get $h)) (then (local.set $iy (i32.sub (local.get $iy) (local.get $h)))))
      (if (i32.eqz (global.get $trailMapReadPtr)) (then (return (f32.const 0))))
      (local.set $idx (i32.add (i32.mul (local.get $iy) (local.get $w)) (local.get $ix)))
      ;; Read from trailMapReadPtr (previous frame state)
      (f32.load (i32.add (global.get $trailMapReadPtr) (i32.shl (local.get $idx) (i32.const 2))))
    )
    (func $deposit (param $x f32) (param $y f32) (param $amount f32)
      (local $ix i32) (local $iy i32) (local $w i32) (local $h i32) (local $idx i32) (local $ptr i32) (local $val f32)
      (local.set $w (i32.trunc_f32_s (global.get $inputs_width)))
      (local.set $h (i32.trunc_f32_s (global.get $inputs_height)))
      (local.set $ix (i32.trunc_f32_s (local.get $x)))
      (local.set $iy (i32.trunc_f32_s (local.get $y)))
      (if (i32.lt_s (local.get $ix) (i32.const 0)) (then (local.set $ix (i32.add (local.get $ix) (local.get $w)))))
      (if (i32.ge_s (local.get $ix) (local.get $w)) (then (local.set $ix (i32.sub (local.get $ix) (local.get $w)))))
      (if (i32.lt_s (local.get $iy) (i32.const 0)) (then (local.set $iy (i32.add (local.get $iy) (local.get $h)))))
      (if (i32.ge_s (local.get $iy) (local.get $h)) (then (local.set $iy (i32.sub (local.get $iy) (local.get $h)))))
      ;; Write to trailMapWritePtr (deposits for this frame)
      (if (global.get $trailMapWritePtr) (then
         (local.set $idx (i32.add (i32.mul (local.get $iy) (local.get $w)) (local.get $ix)))
         (local.set $ptr (i32.add (global.get $trailMapWritePtr) (i32.shl (local.get $idx) (i32.const 2))))
         (local.set $val (f32.load (local.get $ptr)))
         (f32.store (local.get $ptr) (f32.add (local.get $val) (local.get $amount)))
      ))
    )

    (global $agent_count (export "agent_count") (mut i32) (i32.const 0))

    (func (export "step") (param $ptr i32)
      (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)
      (local $r f32)
      (local $dx f32)
      (local $_agent_id f32)
      
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))
    (local.set $species (f32.load (i32.add (local.get $ptr) (i32.const 20))))

    ;; load random values
    

    ;; execute DSL
    nop
    (if (f32.eq (local.get $species) (f32.const 0)) (then
    (local.set $y (f32.sub (local.get $y) (f32.const 0.5)))
    (if (f32.lt (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0.1)) (then
    (local.set $species (f32.const 1))
    ))
    )
    (else
    (if (f32.eq (local.get $species) (f32.const 1)) (then
    (local.set $y (f32.sub (local.get $y) (global.get $inputs_riseSpeed)))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (call $deposit (local.get $x) (local.get $y) (f32.const 1.0))
    (if (f32.lt (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (global.get $inputs_coolingRate)) (then
    (local.set $species (f32.const 2))
    ))
    )
    (else
    (local.set $y (f32.sub (local.get $y) (f32.mul (global.get $inputs_riseSpeed) (f32.const 0.5))))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)) (f32.const 0.5)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (if (f32.lt (local.get $y) (f32.const 0)) (then
    (local.set $species (f32.const 0))
    (local.set $y (global.get $inputs_height))
    (local.set $x (f32.mul (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (global.get $inputs_width)))
    ))
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
    (f32.store (i32.add (local.get $ptr) (i32.const 20)) (local.get $species))
  
    )

    (func (export "step_all") (param $base i32) (param $_total_count i32)
      (local $_outer_i i32) (local $ptr i32) (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)
      (local $r f32)
      (local $dx f32)
      (local $_agent_id f32)
      (local.set $_outer_i (i32.const 0))
      (local.set $ptr (local.get $base))
      (block $exit
        (loop $loop
          (br_if $exit (i32.ge_u (local.get $_outer_i) (local.get $_total_count)))
          
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))
    (local.set $species (f32.load (i32.add (local.get $ptr) (i32.const 20))))

    ;; load random values
    

    ;; execute DSL
    nop
    (if (f32.eq (local.get $species) (f32.const 0)) (then
    (local.set $y (f32.sub (local.get $y) (f32.const 0.5)))
    (if (f32.lt (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (f32.const 0.1)) (then
    (local.set $species (f32.const 1))
    ))
    )
    (else
    (if (f32.eq (local.get $species) (f32.const 1)) (then
    (local.set $y (f32.sub (local.get $y) (global.get $inputs_riseSpeed)))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (call $deposit (local.get $x) (local.get $y) (f32.const 1.0))
    (if (f32.lt (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (global.get $inputs_coolingRate)) (then
    (local.set $species (f32.const 2))
    ))
    )
    (else
    (local.set $y (f32.sub (local.get $y) (f32.mul (global.get $inputs_riseSpeed) (f32.const 0.5))))
    (local.set $r (call $random (local.get $_agent_id) (local.get $x) (local.get $y)))
    (local.set $dx (f32.mul (f32.mul (f32.sub (local.get $r) (f32.const 0.5)) (global.get $inputs_turbulence)) (f32.const 0.5)))
    (local.set $x (f32.add (local.get $x) (local.get $dx)))
    (if (f32.lt (local.get $y) (f32.const 0)) (then
    (local.set $species (f32.const 0))
    (local.set $y (global.get $inputs_height))
    (local.set $x (f32.mul (call $random (local.get $_agent_id) (local.get $x) (local.get $y)) (global.get $inputs_width)))
    ))
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
    (f32.store (i32.add (local.get $ptr) (i32.const 20)) (local.get $species))
  
          (local.set $_outer_i (i32.add (local.get $_outer_i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 24)))
          (br $loop)
        )
      )
    )
  )