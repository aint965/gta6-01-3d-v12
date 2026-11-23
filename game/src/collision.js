// Palkon Auto — collision (Stage B).
// Separating-axis tests for rotated rectangles (cars) against
// axis-aligned rectangles (buildings, water, parked cars), plus a circle
// test for Mara on foot. Obstacles live in a coarse spatial grid so a
// step only tests the handful of rectangles near the car instead of all
// ~700 of them. Pure logic, no DOM: the same module runs in the browser
// and in the Node verification scripts.

function rectCorners(r) {
  const c = Math.cos(r.rot || 0);
  const s = Math.sin(r.rot || 0);
  const out = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push([
      r.cx + (sx * r.hw * c - sz * r.hd * s),
      r.cz + (sx * r.hw * s + sz * r.hd * c),
    ]);
  }
  return out;
}

function project(corners, ax, az) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, z] of corners) {
    const d = x * ax + z * az;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

// SAT test between two rectangles. Returns null when separated, or
// { nx, nz, depth } — the smallest push-out vector for `a` (unit normal
// times the penetration depth) — when they overlap.
export function rectsOverlap(a, b) {
  const ca = rectCorners(a);
  const cb = rectCorners(b);
  const axes = [];
  const ra = a.rot || 0;
  const rb = b.rot || 0;
  axes.push([Math.cos(ra), Math.sin(ra)], [-Math.sin(ra), Math.cos(ra)]);
  axes.push([Math.cos(rb), Math.sin(rb)], [-Math.sin(rb), Math.cos(rb)]);
  let best = null;
  for (const [ax, az] of axes) {
    const [loA, hiA] = project(ca, ax, az);
    const [loB, hiB] = project(cb, ax, az);
    const overlap = Math.min(hiA, hiB) - Math.max(loA, loB);
    if (overlap <= 0) return null;
    if (!best || overlap < best.depth) best = { ax, az, depth: overlap };
  }
  // The normal must point from b toward a, so pushing a along it
  // separates the two.
  const dx = a.cx - b.cx;
  const dz = a.cz - b.cz;
  let nx = best.ax;
  let nz = best.az;
  if (dx * nx + dz * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, depth: best.depth };
}

// Circle (Mara) against an axis-aligned rectangle. Returns null when
// clear, or the push-out vector for the circle centre.
export function circleRect(cx, cz, r, rect) {
  const qx = Math.max(rect.x0, Math.min(cx, rect.x1));
  const qz = Math.max(rect.z0, Math.min(cz, rect.z1));
  let dx = cx - qx;
  let dz = cz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }
  // Centre inside the rectangle: push out along the smallest exit.
  const exits = [
    { nx: -1, nz: 0, depth: cx - rect.x0 + r },
    { nx: 1, nz: 0, depth: rect.x1 - cx + r },
    { nx: 0, nz: -1, depth: cz - rect.z0 + r },
    { nx: 0, nz: 1, depth: rect.z1 - cz + r },
  ];
  exits.sort((a, b) => a.depth - b.depth);
  return exits[0];
}

// A uniform grid over the obstacle rectangles. A query only returns the
// rectangles whose cells touch the query box.
export function buildObstacleGrid(rects, cell = 120) {
  const grid = new Map();
  const key = (ix, iz) => ix + ':' + iz;
  for (const r of rects) {
    const x0 = Math.floor(r.x0 / cell);
    const x1 = Math.floor(r.x1 / cell);
    const z0 = Math.floor(r.z0 / cell);
    const z1 = Math.floor(r.z1 / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(r);
      }
    }
  }
  return {
    cell,
    query(x0, z0, x1, z1) {
      const out = [];
      const seen = new Set();
      for (let ix = Math.floor(x0 / cell); ix <= Math.floor(x1 / cell); ix++) {
        for (let iz = Math.floor(z0 / cell); iz <= Math.floor(z1 / cell); iz++) {
          const list = grid.get(key(ix, iz));
          if (!list) continue;
          for (const r of list) {
            if (!seen.has(r)) {
              seen.add(r);
              out.push(r);
            }
          }
        }
      }
      return out;
    },
  };
}

// Resolve a vehicle rectangle against the static grid and a list of
// dynamic rectangles (traffic cars). Pushes the vehicle out, keeps the
// along-wall speed and drops the into-wall part, and returns the
// hardest impact { speed, nx, nz } or null. Up to 3 passes, so a corner
// wedge resolves. Shared by the game and the Node verification scripts.
export function resolveVehicleRect(v, grid, dynamicRects) {
  const rect = { cx: v.x, cz: v.z, hw: v.hw, hd: v.hd, rot: v.heading };
  let hit = null;
  for (let iter = 0; iter < 3; iter++) {
    let found = null;
    const nearby = grid.query(v.x - 8, v.z - 8, v.x + 8, v.z + 8);
    for (const o of nearby) {
      const res = rectsOverlap(rect, { cx: o.cx, cz: o.cz, hw: o.hw, hd: o.hd, rot: o.rot || 0 });
      if (res) {
        found = res;
        break;
      }
    }
    if (!found && dynamicRects) {
      for (const d of dynamicRects) {
        const res = rectsOverlap(rect, d);
        if (res) {
          found = res;
          break;
        }
      }
    }
    if (!found) break;
    v.x += found.nx * found.depth;
    v.z += found.nz * found.depth;
    rect.cx = v.x;
    rect.cz = v.z;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const dot = fx * found.nx + fz * found.nz;
    if (dot < 0) {
      const impactSpeed = Math.abs(v.speed * dot);
      // Keep the along-wall component, drop the into-wall one: a
      // head-on hit stops the car, a graze keeps most of its speed.
      v.speed *= Math.sqrt(Math.max(0, 1 - dot * dot));
      if (!hit || impactSpeed > hit.speed) hit = { speed: impactSpeed, nx: found.nx, nz: found.nz };
    }
  }
  return hit;
}

// The static obstacles a car can hit: every building as an axis-aligned
// rectangle, every water rectangle, and every parked prop car (the
// drivable ones are dynamic, so they are not obstacles here).
export function buildStaticObstacles(city) {
  const rects = [];
  for (const b of city.buildings) {
    rects.push({
      kind: 'building',
      cx: b.x, cz: b.z, hw: b.w / 2, hd: b.d / 2, rot: 0,
      x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2,
    });
  }
  for (const w of city.water) {
    rects.push({
      kind: 'water',
      cx: (w.x0 + w.x1) / 2, cz: (w.z0 + w.z1) / 2,
      hw: (w.x1 - w.x0) / 2, hd: (w.z1 - w.z0) / 2, rot: 0,
      x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1,
    });
  }
  // The plaza landmarks stand in the middle of the boulevard: the clock
  // tower and the fountain are solid, or a car would drive straight
  // through them. The fountain is a circle in the world; the square
  // around it is close enough for a car or a walker.
  const tower = city.landmarks.clockTower;
  rects.push({
    kind: 'landmark',
    cx: tower.x, cz: tower.z, hw: tower.w / 2, hd: tower.w / 2, rot: 0,
    x0: tower.x - tower.w / 2, z0: tower.z - tower.w / 2,
    x1: tower.x + tower.w / 2, z1: tower.z + tower.w / 2,
  });
  const f = city.landmarks.fountain;
  rects.push({
    kind: 'landmark',
    cx: f.x, cz: f.z, hw: f.r, hd: f.r, rot: 0,
    x0: f.x - f.r, z0: f.z - f.r, x1: f.x + f.r, z1: f.z + f.r,
  });
  for (const c of city.cars) {
    if (c.profile) continue; // drivable cars are dynamic, not obstacles
    const hw = 1.1;
    const hd = 2.3;
    const rot = (c.angle || 0) * (Math.PI / 180);
    const cos = Math.abs(Math.cos(rot));
    const sin = Math.abs(Math.sin(rot));
    rects.push({
      kind: 'car',
      cx: c.x, cz: c.z, hw, hd, rot,
      x0: c.x - (hw * cos + hd * sin), z0: c.z - (hw * sin + hd * cos),
      x1: c.x + (hw * cos + hd * sin), z1: c.z + (hw * sin + hd * cos),
    });
  }
  return rects;
}
