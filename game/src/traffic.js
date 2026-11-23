// Palkon Auto — traffic and people (Stage B).
// Fifteen cars drive rectangular loops on the street network and obey the
// lights; twenty-five people walk sidewalks, the plaza edge and the canal
// promenade. Everything is deterministic: loop positions and light phases
// are pure functions of the game clock, so a run replays identically.
// Pure logic, no DOM: the same module runs in the browser and in the
// Node verification scripts.

// The light cycle is 26 s: north-south green 0-11, yellow 11-13, red
// 13-26; east-west red 0-13, green 13-24, yellow 24-26.
export const CYCLE = 26;
export function lightPhase(t) {
  const u = ((t % CYCLE) + CYCLE) % CYCLE;
  if (u < 11) return { ns: 'green', ew: 'red' };
  if (u < 13) return { ns: 'yellow', ew: 'red' };
  if (u < 24) return { ns: 'red', ew: 'green' };
  return { ns: 'red', ew: 'yellow' };
}

// Where a loop leg crosses a cross street, the car meets a light. Each
// crossing is { s, axis, x, z }: s is the distance along the loop, axis
// is the road the car travels on ('ns' for a north-south leg), and
// (x, z) is the intersection centre. The stop line is 12 units before
// the centre, bumper to line.
export function buildLoops(city) {
  const raw = [
    // The boulevard loop: Solmar Avenue and the 200 street, z 200-600.
    [[400, -1400], [400, 600], [200, 600], [200, -1400]],
    // Glasspoint block: 800 and 1200, z -600-600.
    [[800, -600], [800, 600], [1200, 600], [1200, -600]],
    // The south-east block: 200 and 800, z 200-600.
    [[200, 200], [200, 600], [800, 600], [800, 200]],
    // The north-east block: 1200 and 1600, z -1400--600.
    [[1200, -1400], [1200, -600], [1600, -600], [1600, -1400]],
    // The harbour loop: 800 and 1600, z 1000-1400.
    [[800, 1000], [800, 1400], [1600, 1400], [1600, 1000]],
  ];
  const loops = [];
  for (const pts of raw) {
    const legs = [];
    let length = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      legs.push({ ax, az, bx, bz, len, start: length });
      length += len;
    }
    // Crossings: an intersection lies on a leg when its centre is within
    // 3 units of the leg segment. Each intersection is recorded exactly
    // once, for the leg that ENDS there (t in (0, 1]): the leg a car
    // travels on as it approaches the junction. Recording it for both
    // legs that meet at a corner would test the same crossing against
    // both axes at once — and the two axes are always opposite, so one
    // of them would always read red.
    const crossings = [];
    for (const leg of legs) {
      const axis = leg.ax === leg.bx ? 'ns' : 'ew';
      for (const inter of city.intersections) {
        const dx = inter.x - leg.ax;
        const dz = inter.z - leg.az;
        const lx = leg.bx - leg.ax;
        const lz = leg.bz - leg.az;
        const len2 = lx * lx + lz * lz;
        let t = len2 === 0 ? 0 : (dx * lx + dz * lz) / len2;
        if (t < 0.001) continue; // the corner belongs to the leg before this one
        t = Math.max(0, Math.min(1, t));
        const px = leg.ax + t * lx;
        const pz = leg.az + t * lz;
        if (Math.hypot(inter.x - px, inter.z - pz) < 3) {
          crossings.push({ s: leg.start + t * leg.len, axis, x: inter.x, z: inter.z });
        }
      }
    }
    crossings.sort((a, b) => a.s - b.s);
    loops.push({ pts, legs, length, crossings });
  }
  return loops;
}

function loopPoint(loop, s) {
  s = ((s % loop.length) + loop.length) % loop.length;
  for (const leg of loop.legs) {
    if (s <= leg.start + leg.len) {
      const t = (s - leg.start) / leg.len;
      return {
        x: leg.ax + (leg.bx - leg.ax) * t,
        z: leg.az + (leg.bz - leg.az) * t,
        heading: Math.atan2(leg.bx - leg.ax, leg.bz - leg.az),
      };
    }
  }
  const last = loop.legs[loop.legs.length - 1];
  return { x: last.bx, z: last.bz, heading: Math.atan2(last.bx - last.ax, last.bz - last.az) };
}

const TRAFFIC_COLORS = [
  [0.75, 0.75, 0.78], [0.35, 0.4, 0.5], [0.6, 0.25, 0.22],
  [0.3, 0.45, 0.4], [0.55, 0.55, 0.6], [0.85, 0.7, 0.3],
];

export function createTraffic(city) {
  const loops = buildLoops(city);
  const cars = [];
  const peds = [];
  // Three cars per loop, spread a third of the loop apart, so no loop
  // starts bumper to bumper.
  for (let li = 0; li < loops.length; li++) {
    const loop = loops[li];
    for (let k = 0; k < 3; k++) {
      const s = ((k / 3) + li * 0.13) * loop.length;
      const p = loopPoint(loop, s);
      cars.push({
        loop: li, s, x: p.x, z: p.z, heading: p.heading,
        speed: 0, cruise: 7.5 + ((li * 3 + k) % 3) * 0.7,
        color: TRAFFIC_COLORS[(li * 3 + k) % TRAFFIC_COLORS.length],
        stoppedAtRed: null, // { x, z, gap } while waiting at a red light
        redStops: [],
      });
    }
  }
  // People walk the places people walk: the boulevard sidewalks, the
  // plaza edge, the canal promenade. Each has a short there-and-back
  // path; plaza walkers circle the square instead.
  const pedColors = [
    [0.85, 0.45, 0.35], [0.25, 0.6, 0.6], [0.95, 0.8, 0.15],
    [0.4, 0.6, 0.35], [0.7, 0.4, 0.6], [0.9, 0.9, 0.85],
  ];
  for (let i = 0; i < 11; i++) {
    const side = i % 2 ? 1 : -1;
    const z0 = -1300 + i * 230;
    peds.push({
      x: 400 + side * 21.5, z: z0, heading: 0,
      color: pedColors[i % pedColors.length],
      speed: 1.2 + (i % 3) * 0.25,
      path: [[400 + side * 21.5, z0 - 90], [400 + side * 21.5, z0 + 90]],
      seg: 0, dir: 1, paused: 0,
    });
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.3;
    const r = 125;
    const cx = 400 + Math.cos(a) * r;
    const cz = 300 + Math.sin(a) * r;
    const path = [];
    for (let k = 0; k < 4; k++) {
      const aa = 0.3 + k * Math.PI / 2;
      path.push([400 + Math.cos(aa) * r, 300 + Math.sin(aa) * r]);
    }
    peds.push({
      x: cx, z: cz, heading: 0,
      color: pedColors[(i + 2) % pedColors.length],
      speed: 1.1 + (i % 2) * 0.3,
      path, seg: i % 4, dir: 1, paused: 0,
    });
  }
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const z0 = -1200 + i * 420;
    peds.push({
      x: side * 88, z: z0, heading: 0,
      color: pedColors[(i + 4) % pedColors.length],
      speed: 1.3 + (i % 2) * 0.2,
      path: [[side * 88, z0 - 130], [side * 88, z0 + 130]],
      seg: 0, dir: 1, paused: 0,
    });
  }
  return { loops, cars, peds };
}

// One traffic step. `player` is the player's vehicle (or null) so a
// traffic car stops for it instead of driving through it. Returns the
// list of red-light stops recorded this step (bumper-to-line gaps).
export function stepTraffic(tr, t, dt, player) {
  const phase = lightPhase(t);
  const stops = [];
  // Cars are grouped by loop, in loop order, so each car can see the
  // one ahead of it.
  const byLoop = new Map();
  for (const c of tr.cars) {
    if (!byLoop.has(c.loop)) byLoop.set(c.loop, []);
    byLoop.get(c.loop).push(c);
  }
  for (const list of byLoop.values()) list.sort((a, b) => a.s - b.s);
  for (const c of tr.cars) {
    const loop = tr.loops[c.loop];
    let target = c.cruise;
    // The next crossing ahead on this loop.
    let nextCross = null;
    let crossDist = Infinity;
    for (const cr of loop.crossings) {
      let d = cr.s - c.s;
      if (d < 0) d += loop.length;
      if (d < crossDist) {
        crossDist = d;
        nextCross = cr;
      }
    }
    if (nextCross) {
      const state = phase[nextCross.axis];
      // The stop line is 12 units before the intersection centre; the
      // bumper is 2.2 ahead of the car centre, so the centre must stop
      // 14.2 before the centre.
      const stopDist = crossDist - 14.2;
      let mustStop = false;
      if (state === 'red') {
        mustStop = true;
      } else if (state === 'yellow') {
        // Stop on yellow when the car can still halt before the line
        // (stopping distance v^2/12 at decel 6; the car aims to halt
        // with its bumper one unit before the line, so it needs that
        // much room plus the aim margin).
        const canStop = (c.speed * c.speed) / 12 <= Math.max(0, stopDist - 1);
        if (canStop) {
          mustStop = true;
        } else {
          // Too close to stop: clear the junction only if the line is
          // reached before the yellow ends; otherwise brake anyway and
          // halt as close to the line as the brakes allow.
          const u = ((t % 26) + 26) % 26;
          const yellowEnd = nextCross.axis === 'ns' ? 13 : 26;
          const remaining = yellowEnd - u;
          const timeToLine = stopDist / Math.max(0.5, c.speed);
          mustStop = timeToLine > remaining - 0.3;
        }
      }
      if (mustStop && stopDist < 40) {
        // Brake so the bumper halts one unit before the line:
        // v^2 = 2 a d, with d measured to the aim point one unit short
        // of the line. Aiming at the line itself would let a single
        // discrete step nudge the bumper across it while the car is
        // nearly stopped.
        const want = Math.sqrt(Math.max(0, 2 * 5 * Math.max(0, stopDist - 1)));
        // Close to the line, never speed up toward a red light: the car
        // holds its speed or slows. Accelerating into the braking
        // profile would put it above the speed the remaining distance
        // can absorb, and it would overshoot the line.
        target = stopDist < 12 ? Math.min(target, c.speed, want) : Math.min(target, want);
        // Once halted near the line, hold still instead of creeping
        // forward on the profile (which would overshoot the line).
        if (stopDist < 2 && c.speed < 0.5) {
          target = 0;
          if (!c.stoppedAtRed) {
            // The bumper is 2.2 ahead of the centre, and the centre
            // stops 14.2 before the intersection centre, so the bumper
            // halts at the line: the gap is stopDist itself.
            c.stoppedAtRed = { x: c.x, z: c.z, gap: Math.max(0, stopDist) };
            c.redStops.push(c.stoppedAtRed);
            stops.push(c.stoppedAtRed);
          }
        }
      } else if (c.stoppedAtRed) {
        c.stoppedAtRed = null;
      }
    }
    // Keep a gap to the car ahead on the same loop.
    const list = byLoop.get(c.loop);
    const idx = list.indexOf(c);
    const ahead = list[(idx + 1) % list.length];
    if (ahead && ahead !== c) {
      let gap = ahead.s - c.s;
      if (gap <= 0) gap += loop.length;
      const followGap = gap - 12; // bumper to bumper, roughly
      if (followGap < 14) {
        target = Math.min(target, Math.max(0, ahead.speed * Math.min(1, followGap / 10)));
        if (followGap < 2) target = 0;
      }
    }
    // Stop for the player's car when it is right ahead.
    if (player) {
      const dx = player.x - c.x;
      const dz = player.z - c.z;
      const along = dx * Math.sin(c.heading) + dz * Math.cos(c.heading);
      const side = Math.abs(dx * Math.cos(c.heading) - dz * Math.sin(c.heading));
      if (along > 0 && along < 16 && side < 3) {
        target = 0;
      }
    }
    // Ease toward the target speed.
    const rate = target < c.speed ? 6 : 3.5;
    if (c.speed < target) c.speed = Math.min(target, c.speed + rate * dt);
    else if (c.speed > target) c.speed = Math.max(target, c.speed - rate * dt);
    c.s += c.speed * dt;
    const p = loopPoint(loop, c.s);
    c.x = p.x;
    c.z = p.z;
    // Heading eases toward the leg direction so corners turn instead of
    // snapping.
    let dh = p.heading - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
    c.heading += turn;
  }
  return stops;
}

// One pedestrian step. `vehicles` is the list of cars to pause for
// (the player's car and the traffic cars): a person does not walk into
// a car that is right in front of them.
export function stepPedestrians(tr, dt, vehicles) {
  for (const p of tr.peds) {
    if (p.paused > 0) {
      p.paused -= dt;
      continue;
    }
    const target = p.path[(p.seg + p.dir + p.path.length) % p.path.length];
    const dx = target[0] - p.x;
    const dz = target[1] - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      if (p.path.length === 2) {
        p.dir = -p.dir;
      } else {
        p.seg = (p.seg + 1) % p.path.length;
      }
      continue;
    }
    // A car right ahead: wait for it to pass instead of walking into it.
    let blocked = false;
    for (const v of vehicles) {
      const vx = v.x - p.x;
      const vz = v.z - p.z;
      if (Math.hypot(vx, vz) < 5) {
        const ahead = vx * (dx / dist) + vz * (dz / dist);
        if (ahead > 0) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) {
      p.paused = 0.4;
      continue;
    }
    p.heading = Math.atan2(dx, dz);
    p.x += (dx / dist) * p.speed * dt;
    p.z += (dz / dist) * p.speed * dt;
  }
}
