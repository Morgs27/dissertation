
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    (global $inputs_sensorAngle (export "inputs_sensorAngle") (mut f32) (f32.const 0))
  (global $inputs_speed (export "inputs_speed") (mut f32) (f32.const 0))
  (global $inputs_width (export "inputs_width") (mut f32) (f32.const 0))
  (global $inputs_height (export "inputs_height") (mut f32) (f32.const 0))
    
    
    
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    ;; No random function needed (no randomValues input)

    

    (global $agent_count (export "agent_count") (mut i32) (i32.const 0))

    (func (export "step") (param $ptr i32)
      (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)
      (local $__c f32)
      (local $__s f32)
      (local $__vx f32)
      (local $_agent_id f32)
      
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))
    (local.set $species (f32.load (i32.add (local.get $ptr) (i32.const 20))))

    ;; load random values (indexed: agent_id * numRandomCalls + ri)
    

    ;; execute DSL
    (local.set $__c (call $cos (global.get $inputs_sensorAngle)))
    (local.set $__s (call $sin (global.get $inputs_sensorAngle)))
    (local.set $__vx (f32.sub (f32.mul (local.get $vx) (local.get $__c)) (f32.mul (local.get $vy) (local.get $__s))))
    (local.set $vy (f32.add (f32.mul (local.get $vx) (local.get $__s)) (f32.mul (local.get $vy) (local.get $__c))))
    (local.set $vx (local.get $__vx))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (global.get $inputs_speed))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (global.get $inputs_speed))))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.ge (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.ge (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))

    ;; store back (species at offset 20 is preserved, not modified)
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
    (f32.store (i32.add (local.get $ptr) (i32.const 20)) (local.get $species))
  
    )

    (func (export "step_all") (param $base i32) (param $_total_count i32)
      (local $_outer_i i32) (local $ptr i32) (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)
      (local $__c f32)
      (local $__s f32)
      (local $__vx f32)
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

    ;; load random values (indexed: agent_id * numRandomCalls + ri)
    

    ;; execute DSL
    (local.set $__c (call $cos (global.get $inputs_sensorAngle)))
    (local.set $__s (call $sin (global.get $inputs_sensorAngle)))
    (local.set $__vx (f32.sub (f32.mul (local.get $vx) (local.get $__c)) (f32.mul (local.get $vy) (local.get $__s))))
    (local.set $vy (f32.add (f32.mul (local.get $vx) (local.get $__s)) (f32.mul (local.get $vy) (local.get $__c))))
    (local.set $vx (local.get $__vx))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (global.get $inputs_speed))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (global.get $inputs_speed))))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.ge (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.ge (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))

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