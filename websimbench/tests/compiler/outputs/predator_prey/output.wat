
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    (global $inputs_perceptionRadius (export "inputs_perceptionRadius") (mut f32) (f32.const 0))
  (global $inputs_cohesionFactor (export "inputs_cohesionFactor") (mut f32) (f32.const 0))
  (global $inputs_fleeFactor (export "inputs_fleeFactor") (mut f32) (f32.const 0))
  (global $inputs_preySpeed (export "inputs_preySpeed") (mut f32) (f32.const 0))
  (global $inputs_chaseFactor (export "inputs_chaseFactor") (mut f32) (f32.const 0))
  (global $inputs_separationDist (export "inputs_separationDist") (mut f32) (f32.const 0))
  (global $inputs_separationFactor (export "inputs_separationFactor") (mut f32) (f32.const 0))
  (global $inputs_predatorSpeed (export "inputs_predatorSpeed") (mut f32) (f32.const 0))
  (global $inputs_dt (export "inputs_dt") (mut f32) (f32.const 0))
  (global $inputs_width (export "inputs_width") (mut f32) (f32.const 0))
  (global $inputs_height (export "inputs_height") (mut f32) (f32.const 0))
    
    
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
      (local $avgX f32)
      (local $avgY f32)
      (local $other_id f32)
      (local $other_x f32)
      (local $other_y f32)
      (local $dx f32)
      (local $dy f32)
      (local $__speed2 f32)
      (local $__scale f32)
      (local $dist2 f32)
      (local $_agent_id f32)
      
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))

    ;; load random values
    

    ;; execute DSL
    
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
          (if (f32.lt (local.get $_dist) (global.get $inputs_perceptionRadius)) (then
            (local.set $nearby_count (f32.add (local.get $nearby_count) (f32.const 1)))
            (local.set $nearby_sum_x (f32.add (local.get $nearby_sum_x) (local.get $_other_x)))
            (local.set $nearby_sum_y (f32.add (local.get $nearby_sum_y) (local.get $_other_y)))
            (local.set $nearby_sum_vx (f32.add (local.get $nearby_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $nearby_sum_vy (f32.add (local.get $nearby_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 20)))
        (br $_neighbor_loop)
      )
    )
    (if (f32.eq (local.get $id) (local.get $%) (f32.const 2) (f32.const 0)) (then
    (if (f32.gt (local.get $nearby_count) (f32.const 0)) (then
    (local.set $avgX (local.get $mean(nearby_x)))
    (local.set $avgY (local.get $mean(nearby_y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (f32.sub (local.get $avgX) (local.get $x)) (global.get $inputs_cohesionFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (f32.sub (local.get $avgY) (local.get $y)) (global.get $inputs_cohesionFactor))))
    ))
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $x) (local.get $other_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $other_y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (global.get $inputs_fleeFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (global.get $inputs_fleeFactor))))
    ))
    ))
    (local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))
    (if (f32.gt (local.get $__speed2) (f32.mul (global.get $inputs_preySpeed) (global.get $inputs_preySpeed))) (then
      (local.set $__scale (f32.sqrt (f32.div (f32.mul (global.get $inputs_preySpeed) (global.get $inputs_preySpeed)) (local.get $__speed2))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))
    ))
    ))
    (if (f32.eq (local.get $id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 0)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $other_x) (local.get $x)))
    (local.set $dy (f32.sub (local.get $other_y) (local.get $y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (global.get $inputs_chaseFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (global.get $inputs_chaseFactor))))
    ))
    ))
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $x) (local.get $other_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $other_y)))
    (local.set $dist2 (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy))))
    (if (i32.and (f32.lt (local.get $dist2) (f32.mul (global.get $inputs_separationDist) (global.get $inputs_separationDist))) (f32.gt (local.get $dist2) (f32.const 0))) (then
    (local.set $vx (f32.add (local.get $vx) (f32.mul (f32.div (local.get $dx) (local.get $dist2)) (global.get $inputs_separationFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (f32.div (local.get $dy) (local.get $dist2)) (global.get $inputs_separationFactor))))
    ))
    ))
    ))
    (local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))
    (if (f32.gt (local.get $__speed2) (f32.mul (global.get $inputs_predatorSpeed) (global.get $inputs_predatorSpeed))) (then
      (local.set $__scale (f32.sqrt (f32.div (f32.mul (global.get $inputs_predatorSpeed) (global.get $inputs_predatorSpeed)) (local.get $__speed2))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))
    ))
    ))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (global.get $inputs_dt))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (global.get $inputs_dt))))

    ;; store back
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
      (local $avgX f32)
      (local $avgY f32)
      (local $other_id f32)
      (local $other_x f32)
      (local $other_y f32)
      (local $dx f32)
      (local $dy f32)
      (local $__speed2 f32)
      (local $__scale f32)
      (local $dist2 f32)
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
          (if (f32.lt (local.get $_dist) (global.get $inputs_perceptionRadius)) (then
            (local.set $nearby_count (f32.add (local.get $nearby_count) (f32.const 1)))
            (local.set $nearby_sum_x (f32.add (local.get $nearby_sum_x) (local.get $_other_x)))
            (local.set $nearby_sum_y (f32.add (local.get $nearby_sum_y) (local.get $_other_y)))
            (local.set $nearby_sum_vx (f32.add (local.get $nearby_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $nearby_sum_vy (f32.add (local.get $nearby_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 20)))
        (br $_neighbor_loop)
      )
    )
    (if (f32.eq (local.get $id) (local.get $%) (f32.const 2) (f32.const 0)) (then
    (if (f32.gt (local.get $nearby_count) (f32.const 0)) (then
    (local.set $avgX (local.get $mean(nearby_x)))
    (local.set $avgY (local.get $mean(nearby_y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (f32.sub (local.get $avgX) (local.get $x)) (global.get $inputs_cohesionFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (f32.sub (local.get $avgY) (local.get $y)) (global.get $inputs_cohesionFactor))))
    ))
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $x) (local.get $other_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $other_y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (global.get $inputs_fleeFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (global.get $inputs_fleeFactor))))
    ))
    ))
    (local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))
    (if (f32.gt (local.get $__speed2) (f32.mul (global.get $inputs_preySpeed) (global.get $inputs_preySpeed))) (then
      (local.set $__scale (f32.sqrt (f32.div (f32.mul (global.get $inputs_preySpeed) (global.get $inputs_preySpeed)) (local.get $__speed2))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))
    ))
    ))
    (if (f32.eq (local.get $id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 0)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $other_x) (local.get $x)))
    (local.set $dy (f32.sub (local.get $other_y) (local.get $y)))
    (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $dx) (global.get $inputs_chaseFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $dy) (global.get $inputs_chaseFactor))))
    ))
    ))
    ;; TODO: foreach loops only supported for nearbyAgents
    (local.set $other_id (local.get $other_id))
    (if (f32.eq (local.get $other_id) (local.get $%) (f32.const 2) (f32.const 1)) (then
    (local.set $other_x (local.get $other_x))
    (local.set $other_y (local.get $other_y))
    (local.set $dx (f32.sub (local.get $x) (local.get $other_x)))
    (local.set $dy (f32.sub (local.get $y) (local.get $other_y)))
    (local.set $dist2 (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy))))
    (if (i32.and (f32.lt (local.get $dist2) (f32.mul (global.get $inputs_separationDist) (global.get $inputs_separationDist))) (f32.gt (local.get $dist2) (f32.const 0))) (then
    (local.set $vx (f32.add (local.get $vx) (f32.mul (f32.div (local.get $dx) (local.get $dist2)) (global.get $inputs_separationFactor))))
    (local.set $vy (f32.add (local.get $vy) (f32.mul (f32.div (local.get $dy) (local.get $dist2)) (global.get $inputs_separationFactor))))
    ))
    ))
    ))
    (local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))
    (if (f32.gt (local.get $__speed2) (f32.mul (global.get $inputs_predatorSpeed) (global.get $inputs_predatorSpeed))) (then
      (local.set $__scale (f32.sqrt (f32.div (f32.mul (global.get $inputs_predatorSpeed) (global.get $inputs_predatorSpeed)) (local.get $__speed2))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))
    ))
    ))
    (if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))
    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))
    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))
    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))
    (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (global.get $inputs_dt))))
    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (global.get $inputs_dt))))

    ;; store back
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
  
          (local.set $_outer_i (i32.add (local.get $_outer_i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 20)))
          (br $loop)
        )
      )
    )
  )