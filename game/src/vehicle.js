// Palkon Auto — vehicles (Stage B).
// Four arcade driving profiles, each with a top speed the car must
// actually reach on a straight road. Physics is deliberately simple and
// deterministic: fixed-step integration, a top speed approached
// asymptotically so the car settles at its rating instead of overshooting
// it, steering that bites less the faster the car goes, and a collision
// step that pushes the car out of buildings, water and parked cars and
// reports the impact so the game can shake the camera and throw dust.
// Pure logic, no DOM: the same module runs in the browser and in the
// Node verification scripts.

// Top speeds are km/h; the rest is tuned so a standing start reaches
// the top in roughly 8-12 s on the boulevard.
export const PROFILES = {
  compact: { topKmh: 115, accel: 9.0, brake: 22, reverseTopKmh: 30, label: 'Compact' },
  sedan: { topKmh: 130, accel: 10.0, brake: 22, reverseTopKmh: 30, label: 'Sedan' },
  van: { topKmh: 108, accel: 7.0, brake: 20, reverseTopKmh: 28, label: 'Van' },
  coupe: { topKmh: 158, accel: 12.0, brake: 24, reverseTopKmh: 32, label: 'Coupe' },
};

const KMH = 1 / 3.6;

// A drivable car. `heading` is the direction the nose points:
// forward = (sin(heading), cos(heading)) in (x, z), so heading 0 faces
// south (+z) and heading PI faces north (-z). The body is 2.0 wide and
// 4.4 long; the rectangle used for collision is slightly inset so a
// scrape along a wall does not snag on a corner.
export function createVehicle(profileName, x, z, heading, color, taxi = false) {
  const p = PROFILES[profileName];
  return {
    profile: profileName,
    top: p.topKmh * KMH,
    accel: p.accel,
    brake: p.brake,
    reverseTop: p.reverseTopKmh * KMH,
    x, z, heading,
    speed: 0, // m/s, signed: + forward, - reverse
    color, taxi,
    hw: 1.0, hd: 2.2,
    // Last impact, for the game to read: { speed, nx, nz } or null.
    impact: null,
    // Distance driven, for the drive test.
    odometer: 0,
  };
}

// One fixed step. `input` is { throttle: 0..1, brake: bool, steer: -1..1 }.
// `resolve` is an optional function (veh) => impact|null that pushes the
// vehicle out of obstacles and returns the impact it found.
export function stepVehicle(v, input, dt, resolve) {
  const fwd = v.speed >= 0 ? 1 : -1;
  if (input.throttle > 0) {
    if (v.speed < 0) {
      // Still rolling backwards: the throttle brakes first.
      v.speed = Math.min(0, v.speed + v.brake * dt);
    } else {
      // Asymptotic approach to the top speed: strong off the line,
      // gentle near the rating, and it never overshoots it.
      const headroom = Math.max(0, 1 - v.speed / v.top);
      v.speed += v.accel * headroom * input.throttle * dt;
      if (v.speed > v.top) v.speed = v.top;
    }
  } else if (input.brake) {
    if (v.speed > 0.5) {
      v.speed = Math.max(0, v.speed - v.brake * dt);
    } else {
      // At a standstill the brake becomes reverse, up to its own cap.
      v.speed = Math.max(-v.reverseTop, v.speed - 6 * dt);
    }
  } else {
    // Coast: rolling resistance plus a little drag.
    const drag = 1.2 + 0.02 * Math.abs(v.speed);
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), drag * dt);
    if (Math.abs(v.speed) < 0.02) v.speed = 0;
  }
  // Steering bites hardest at parking speed and softens as the car goes
  // faster; it reverses when the car reverses.
  const grip = Math.min(1, Math.abs(v.speed) / 8);
  const maxTurn = 2.1 / (1 + Math.abs(v.speed) * 0.045);
  v.heading += input.steer * maxTurn * grip * fwd * dt;
  const dx = Math.sin(v.heading) * v.speed * dt;
  const dz = Math.cos(v.heading) * v.speed * dt;
  v.x += dx;
  v.z += dz;
  v.odometer += Math.abs(v.speed) * dt;
  v.impact = null;
  if (resolve) {
    const hit = resolve(v);
    if (hit) v.impact = hit;
  }
  return v;
}

// Mara on foot: a circle of radius 0.8 that walks at 6 m/s relative to
// the camera yaw and is pushed out of buildings, water and cars by the
// `resolve` callback (circle-vs-rectangle, returns a push-out or null).
export function createWalker(x, z) {
  return { x, z, heading: 0, speed: 0, radius: 0.8 };
}

export function stepWalker(w, moveX, moveZ, dt, resolve) {
  const len = Math.hypot(moveX, moveZ);
  let vx = 0;
  let vz = 0;
  if (len > 0.01) {
    vx = (moveX / len) * 6;
    vz = (moveZ / len) * 6;
    w.heading = Math.atan2(moveX, moveZ);
  }
  w.speed = Math.hypot(vx, vz);
  w.x += vx * dt;
  w.z += vz * dt;
  if (resolve) resolve(w);
  return w;
}
