
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    (global $inputs_gravity (export "inputs_gravity") (mut f32) (f32.const 0))
  (global $inputs_repulsionRadius (export "inputs_repulsionRadius") (mut f32) (f32.const 0))
  (global $inputs_repulsionForce (export "inputs_repulsionForce") (mut f32) (f32.const 0))
  (global $inputs_damping (export "inputs_damping") (mut f32) (f32.const 0))
  (global $inputs_height (export "inputs_height") (mut f32) (f32.const 0))
  (global $inputs_width (export "inputs_width") (mut f32) (f32.const 0))
    
    (global $randomValuesPtr (export "randomValuesPtr") (mut i32) (i32.const 0))
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    (func $random (param $id f32) (param $x f32) (param $y f32) (result f32) (call $random_js))

    

    (global $agent_count (export "agent_count") (mut i32) (i32.const 0))

    (func (export "step") (param $ptr i32)
      (local $x f32) (local $y f32) (local $vx f32) (local $vy f32)
      (local $nearby f32)
      (local $nearby_count f32)
      (local $nearby_sum_x f32)
      (local $nearby_sum_y f32)
      (local $nearby_sum_vx f32)
      (local $nearby_sum_vy f32)
      (local $_loop_idx i32)
      (local $_loop_ptr i32)
      (local $_other_x f32)
      (local $_other_y f32)
      (local $_dx f32)
      (local $_dy f32)
      (local $_dist f32)
      (local $_foreach_idx i32)
      (local $_foreach_ptr i32)
      (local $nearby_x f32)
      (local $nearby_y f32)
      (local $nearby_vx f32)
      (local $nearby_vy f32)
      (local $_foreach_dx f32)
      (local $_foreach_dy f32)
      (local $_foreach_dist f32)
      (local $dx f32)
      (local $dy f32)
      (local $dist2 f32)
      (local $force f32)
      (local $_agent_id f32)
      (local $r f32)
      
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))

    ;; load random values
    (local.set $r (f32.load (i32.add (global.get $randomValuesPtr) (i32.shl (i32.trunc_f32_u (local.get $_agent_id)) (i32.const 2)))))

    ;; execute DSL
    (local.set $vy (f32.add (local.get $vy) (global.get $inputs_gravity)))
    
    ;; Find neighbors within radius (reading from agentsReadPtr for order-independent sensing)
    (local.set $nearby_count (f32.const 0))
    (local.set $nearby_sum_x (f32.const 0))
    (local.set $nearby_sum_y (f32.const 0))
    (local.set $nearby_sum_vx (f32.const 0))
    (local.set $nearby_sum_vy (f32.const 0))
    (local.set $_loop_idx (i32.const 0))
    (local.set $_loop_ptr (global.get $agentsReadPtr))
    (block $_neighbor_exit
      (loop $_neighbor_loop
        (br_if $_neighbor_exit (i32.ge_u (local.get $_loop_idx) (global.get $agent_count)))
        (if (i32.ne (local.get $_loop_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          (local.set $_other_x (f32.load (i32.add (local.get $_loop_ptr) (i32.const 4))))
          (local.set $_other_y (f32.load (i32.add (local.get $_loop_ptr) (i32.const 8))))
          (local.set $_dx (f32.sub (local.get $x) (local.get $_other_x)))
          (local.set $_dy (f32.sub (local.get $y) (local.get $_other_y)))
          (local.set $_dist (f32.sqrt (f32.add (f32.mul (local.get $_dx) (local.get $_dx)) (f32.mul (local.get $_dy) (local.get $_dy)))))
          (if (f32.lt (local.get $_dist) (global.get $inputs_repulsionRadius)) (then
            (local.set $nearby_count (f32.add (local.get $nearby_count) (f32.const 1)))
            (local.set $nearby_sum_x (f32.add (local.get $nearby_sum_x) (local.get $_other_x)))
            (local.set $nearby_sum_y (f32.add (local.get $nearby_sum_y) (local.get $_other_y)))
            (local.set $nearby_sum_vx (f32.add (local.get $nearby_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $nearby_sum_vy (f32.add (local.get $nearby_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 24)))
        (br $_neighbor_loop)
      )
    )
    
    ;; Foreach loop over agents (presumed neighbors/all)
    (local.set $_foreach_idx (i32.const 0))
    (local.set $_foreach_ptr (global.get $agentsReadPtr))
    (block $_foreach_exit
      (loop $_foreach_loop
        (br_if $_foreach_exit (i32.ge_u (local.get $_foreach_idx) (global.get $agent_count)))
        (if (i32.const 1) (then
          (local.set $nearby_x (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 4))))
          (local.set $nearby_y (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 8))))
          (local.set $nearby_vx (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 12))))
          (local.set $nearby_vy (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 16))))
          (if (i32.const 1) (then
            ;; Loop body will be inserted here by subsequent lines
    (local.set $dx (f32.sub (local.get $x) (local.get $nearby_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $nearby_y)))
    (local.set $dist2 (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy))))
    (if (i32.and (f32.gt (local.get $dist2) (f32.const 0)) (f32.lt (local.get $dist2) (f32.mul (global.get $inputs_repulsionRadius) (global.get $inputs_repulsionRadius)))) (then
    (local.set $force (f32.div (global.get $inputs_repulsionForce) (f32.add (local.get $dist2) (f32.const 0.1))))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (local.get $force))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (local.get $force))))
              ))
        ))
        (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))
        (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 24)))
        (br $_foreach_loop)
      )
    )
    ))
    (local.set $vx (f32.mul (local.get $vx) (global.get $inputs_damping)))
    (local.set $vy (f32.mul (local.get $vy) (global.get $inputs_damping)))
    (if (f32.ge (local.get $y) (global.get $inputs_height)) (then
    (local.set $y (f32.sub (global.get $inputs_height) (f32.const 1)))
    (local.set $vy (f32.sub (f32.mul (local.get $vy) ) (f32.const 0.8)))
    (local.set $vx (f32.div (f32.div (f32.mul (local.get $vx) (local.get $0.9;)) ) (local.get $Friction)))
    ))
    (if (i32.or (f32.le (local.get $x) (f32.const 0)) (f32.ge (local.get $x) (global.get $inputs_width))) (then
    (local.set $vx (f32.sub (f32.mul (local.get $vx) ) (f32.const 0.8)))
    ))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (f32.const 1.0))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (f32.const 1.0))))

    ;; store back (species at offset 20 is preserved, not modified)
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
  
    )

    (func (export "step_all") (param $base i32) (param $count i32)
      (local $_outer_i i32) (local $ptr i32) (local $x f32) (local $y f32) (local $vx f32) (local $vy f32)
      (local $nearby f32)
      (local $nearby_count f32)
      (local $nearby_sum_x f32)
      (local $nearby_sum_y f32)
      (local $nearby_sum_vx f32)
      (local $nearby_sum_vy f32)
      (local $_loop_idx i32)
      (local $_loop_ptr i32)
      (local $_other_x f32)
      (local $_other_y f32)
      (local $_dx f32)
      (local $_dy f32)
      (local $_dist f32)
      (local $_foreach_idx i32)
      (local $_foreach_ptr i32)
      (local $nearby_x f32)
      (local $nearby_y f32)
      (local $nearby_vx f32)
      (local $nearby_vy f32)
      (local $_foreach_dx f32)
      (local $_foreach_dy f32)
      (local $_foreach_dist f32)
      (local $dx f32)
      (local $dy f32)
      (local $dist2 f32)
      (local $force f32)
      (local $_agent_id f32)
      (local $r f32)
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
    (local.set $r (f32.load (i32.add (global.get $randomValuesPtr) (i32.shl (i32.trunc_f32_u (local.get $_agent_id)) (i32.const 2)))))

    ;; execute DSL
    (local.set $vy (f32.add (local.get $vy) (global.get $inputs_gravity)))
    
    ;; Find neighbors within radius (reading from agentsReadPtr for order-independent sensing)
    (local.set $nearby_count (f32.const 0))
    (local.set $nearby_sum_x (f32.const 0))
    (local.set $nearby_sum_y (f32.const 0))
    (local.set $nearby_sum_vx (f32.const 0))
    (local.set $nearby_sum_vy (f32.const 0))
    (local.set $_loop_idx (i32.const 0))
    (local.set $_loop_ptr (global.get $agentsReadPtr))
    (block $_neighbor_exit
      (loop $_neighbor_loop
        (br_if $_neighbor_exit (i32.ge_u (local.get $_loop_idx) (global.get $agent_count)))
        (if (i32.ne (local.get $_loop_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          (local.set $_other_x (f32.load (i32.add (local.get $_loop_ptr) (i32.const 4))))
          (local.set $_other_y (f32.load (i32.add (local.get $_loop_ptr) (i32.const 8))))
          (local.set $_dx (f32.sub (local.get $x) (local.get $_other_x)))
          (local.set $_dy (f32.sub (local.get $y) (local.get $_other_y)))
          (local.set $_dist (f32.sqrt (f32.add (f32.mul (local.get $_dx) (local.get $_dx)) (f32.mul (local.get $_dy) (local.get $_dy)))))
          (if (f32.lt (local.get $_dist) (global.get $inputs_repulsionRadius)) (then
            (local.set $nearby_count (f32.add (local.get $nearby_count) (f32.const 1)))
            (local.set $nearby_sum_x (f32.add (local.get $nearby_sum_x) (local.get $_other_x)))
            (local.set $nearby_sum_y (f32.add (local.get $nearby_sum_y) (local.get $_other_y)))
            (local.set $nearby_sum_vx (f32.add (local.get $nearby_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $nearby_sum_vy (f32.add (local.get $nearby_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 24)))
        (br $_neighbor_loop)
      )
    )
    
    ;; Foreach loop over agents (presumed neighbors/all)
    (local.set $_foreach_idx (i32.const 0))
    (local.set $_foreach_ptr (global.get $agentsReadPtr))
    (block $_foreach_exit
      (loop $_foreach_loop
        (br_if $_foreach_exit (i32.ge_u (local.get $_foreach_idx) (global.get $agent_count)))
        (if (i32.const 1) (then
          (local.set $nearby_x (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 4))))
          (local.set $nearby_y (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 8))))
          (local.set $nearby_vx (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 12))))
          (local.set $nearby_vy (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 16))))
          (if (i32.const 1) (then
            ;; Loop body will be inserted here by subsequent lines
    (local.set $dx (f32.sub (local.get $x) (local.get $nearby_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $nearby_y)))
    (local.set $dist2 (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy))))
    (if (i32.and (f32.gt (local.get $dist2) (f32.const 0)) (f32.lt (local.get $dist2) (f32.mul (global.get $inputs_repulsionRadius) (global.get $inputs_repulsionRadius)))) (then
    (local.set $force (f32.div (global.get $inputs_repulsionForce) (f32.add (local.get $dist2) (f32.const 0.1))))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (local.get $force))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (local.get $force))))
              ))
        ))
        (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))
        (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 24)))
        (br $_foreach_loop)
      )
    )
    ))
    (local.set $vx (f32.mul (local.get $vx) (global.get $inputs_damping)))
    (local.set $vy (f32.mul (local.get $vy) (global.get $inputs_damping)))
    (if (f32.ge (local.get $y) (global.get $inputs_height)) (then
    (local.set $y (f32.sub (global.get $inputs_height) (f32.const 1)))
    (local.set $vy (f32.sub (f32.mul (local.get $vy) ) (f32.const 0.8)))
    (local.set $vx (f32.div (f32.div (f32.mul (local.get $vx) (local.get $0.9;)) ) (local.get $Friction)))
    ))
    (if (i32.or (f32.le (local.get $x) (f32.const 0)) (f32.ge (local.get $x) (global.get $inputs_width))) (then
    (local.set $vx (f32.sub (f32.mul (local.get $vx) ) (f32.const 0.8)))
    ))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (f32.const 1.0))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (f32.const 1.0))))

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