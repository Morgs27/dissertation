const BOID_DSL = `
  // --- alignment: steer toward average neighbor velocity
  let avgVx = 0
  let avgVy = 0
  if (inputs.neighbors.length > 0) {
    for (let n of inputs.neighbors) {
      avgVx += n.state.vx
      avgVy += n.state.vy
    }
    avgVx /= inputs.neighbors.length
    avgVy /= inputs.neighbors.length
    applyForce((avgVx - state.vx) * inputs.alignmentFactor,
               (avgVy - state.vy) * inputs.alignmentFactor)
  }

  // --- cohesion: steer toward average neighbor position
  let avgX = 0
  let avgY = 0
  if (inputs.neighbors.length > 0) {
    for (let n of inputs.neighbors) {
      avgX += n.state.x
      avgY += n.state.y
    }
    avgX /= inputs.neighbors.length
    avgY /= inputs.neighbors.length
    applyForce((avgX - state.x) * inputs.cohesionFactor,
               (avgY - state.y) * inputs.cohesionFactor)
  }

  // --- separation: avoid getting too close
  for (let n of inputs.neighbors) {
    const dx = state.x - n.state.x
    const dy = state.y - n.state.y
    const dist2 = dx*dx + dy*dy
    if (dist2 < inputs.separationDist * inputs.separationDist) {
      applyForce(dx * inputs.separationFactor,
                 dy * inputs.separationFactor)
    }
  }

  // --- move & limit speed
  limitSpeed(inputs.maxSpeed)
  move()
`
