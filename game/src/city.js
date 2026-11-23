// Palkon Auto — Solmar, the city (Stage A).
// A deterministic city of about 3,840 x 3,456 units, seed 20261123, laid
// out the way a real city grows instead of a uniform grid:
//   - one wide boulevard (Solmar Avenue, x = 400) down the centre, lined
//     with the tallest buildings, ending at Marina Plaza by the harbour;
//   - secondary streets and narrow local streets at visibly different
//     widths, with varied spacing — never one regular grid;
//   - Old Solmar, the old quarter west of the canal, whose streets run
//     off-grid: angled, drifted and staggered, plus a diagonal avenue;
//   - a central plaza with a clock tower and a fountain where the
//     boulevard meets the main cross street, height and density falling
//     away from it toward the beach and the residential edges;
//   - a canal with only three bridges, a harbour, a beach, a park, and a
//     promenade along the canal with lamps and trees.
// Streets are thick line segments (ax,az)-(bx,bz) with a width, so angled
// streets work the same as straight ones for placement, rendering and the
// collision grid later stages build on them.

import { mulberry32, cellHash } from './rng.js';

export const CITY_SEED = 20261123;

export const DISTRICTS = [
  'Old Solmar',
  'Canal Ward',
  'South Market',
  'Citrus Quarter',
  'Pearl Marina',
  'Glasspoint',
  'Sunstrand Beach',
];

function distToSegment(px, pz, s) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = s.ax + t * dx;
  const cz = s.az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

function inRect(x, z, r) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

function rectsOverlap(a, b, gap) {
  return a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.z0 - gap < b.z1 && b.z0 - gap < a.z1;
}

export function districtAt(x, z) {
  if (z >= 1200 && x >= -700 && x <= 700) return 'Pearl Marina';
  if (z >= 1200 && x > 450) return 'Sunstrand Beach';
  if (x < -70 && z < -300) return 'Old Solmar';
  if (x > 70 && z < -300) return 'Citrus Quarter';
  if (x < -70 && z < 1200) return 'South Market';
  if (x > 700 && z < 1200) return 'Glasspoint';
  return 'Canal Ward';
}

export function buildCity(seed = CITY_SEED) {
  const rng = mulberry32(seed);
  const bounds = { x0: -1920, x1: 1920, z0: -1728, z1: 1728 };
  const water = [
    { x0: -70, z0: -1728, x1: 70, z1: 1200 }, // the canal
    { x0: -450, z0: 1200, x1: 450, z1: 1728 }, // the harbour
  ];
  const beach = [
    { x0: -1920, z0: 1580, x1: -450, z1: 1728 },
    { x0: 450, z0: 1580, x1: 1920, z1: 1728 },
  ];
  const park = { x0: 900, z0: -1500, x1: 1700, z1: -700 };
  const plaza = { x: 400, z: 300, half: 110 };

  const isWater = (x, z) => water.some((r) => inRect(x, z, r));
  const nearStreet = (x, z, margin) => {
    for (const s of streets) {
      if (distToSegment(x, z, s) < s.w / 2 + margin) return true;
    }
    return false;
  };

  // ---- streets ------------------------------------------------------------
  const streets = [];
  const addStreet = (ax, az, bx, bz, w, kind) => {
    streets.push({ ax, az, bx, bz, w, kind });
  };
  // The boulevard: Solmar Avenue, the one wide north-south avenue.
  addStreet(400, -1728, 400, 1200, 36, 'boulevard');
  // North-south secondary streets. In Old Solmar (z < -300) the three
  // western ones drift at a slight angle instead of running true north.
  for (const cx of [-1600, -1200, -800, -400, 200, 800, 1200, 1600]) {
    if (cx <= -800) {
      const drift = (cellHash(cx, 7, seed) - 0.5) * 140;
      addStreet(cx + drift, -1728, cx - drift, -300, 16, 'secondary');
      addStreet(cx, -300, cx, 1728, 16, 'secondary');
    } else {
      addStreet(cx, -1728, cx, 1728, 16, 'secondary');
    }
  }
  // East-west secondary streets. Only three cross the canal, on bridges;
  // the rest stop at the canal banks, as in a real city with few crossings.
  for (const cz of [-1400, -600, -200, 200, 600, 1400]) {
    if (cz < -300) {
      // Old Solmar's cross streets run a few degrees off true east-west.
      const tilt = (cellHash(3, cz, seed) - 0.5) * 90;
      addStreet(-1920, cz - tilt, -70, cz + tilt, 16, 'secondary');
      addStreet(70, cz, 1920, cz, 16, 'secondary');
    } else {
      addStreet(-1920, cz, -70, cz, 16, 'secondary');
      addStreet(70, cz, 1920, cz, 16, 'secondary');
    }
  }
  for (const cz of [-1000, 0, 1000]) {
    addStreet(-1920, cz, 1920, cz, 16, 'secondary');
  }
  // Old Solmar's diagonal avenue, cutting across the old quarter.
  addStreet(-1820, -1620, -320, -420, 20, 'secondary');
  // A few narrow local streets inside the big residential blocks.
  addStreet(1000, -1600, 1000, -400, 10, 'local');
  addStreet(1400, -1600, 1400, -400, 10, 'local');
  addStreet(1000, -1000, 1800, -1000, 10, 'local');
  addStreet(-1600, 400, -800, 400, 10, 'local');
  addStreet(-1600, 800, -800, 800, 10, 'local');
  addStreet(900, 1400, 1800, 1400, 10, 'local');
  addStreet(1200, 1200, 1200, 1700, 10, 'local');

  const bridges = [-1000, 0, 1000].map((zc) => ({ x0: -95, z0: zc - 12, x1: 95, z1: zc + 12, zc }));

  // ---- buildings ----------------------------------------------------------
  const buildings = [];
  // One wall palette per district, so each quarter reads from a block
  // away: Old Solmar is ochre and terracotta, Canal Ward brick red,
  // South Market sand and coral, Citrus Quarter leaf green and citrus
  // yellow, Pearl Marina white and pale blue, Glasspoint blue glass,
  // Sunstrand Beach sand and pastel pink. Roofs follow automatically
  // (roof = wall colour x 0.62 in tryPlace).
  const DISTRICT_PALETTES = {
    'Old Solmar': [[0.78, 0.55, 0.35], [0.72, 0.48, 0.32], [0.85, 0.72, 0.5], [0.66, 0.42, 0.35]],
    'Canal Ward': [[0.68, 0.38, 0.3], [0.74, 0.45, 0.34], [0.6, 0.42, 0.38], [0.5, 0.58, 0.55]],
    'South Market': [[0.8, 0.66, 0.45], [0.85, 0.55, 0.38], [0.78, 0.6, 0.4], [0.82, 0.62, 0.45]],
    'Citrus Quarter': [[0.55, 0.65, 0.35], [0.8, 0.72, 0.4], [0.85, 0.78, 0.6], [0.62, 0.68, 0.38]],
    'Pearl Marina': [[0.88, 0.87, 0.82], [0.78, 0.85, 0.86], [0.85, 0.82, 0.75], [0.82, 0.86, 0.88]],
    'Glasspoint': [[0.55, 0.68, 0.72]],
    'Sunstrand Beach': [[0.88, 0.78, 0.65], [0.9, 0.7, 0.62], [0.85, 0.75, 0.68], [0.88, 0.68, 0.6]],
  };

  function tryPlace(x, z, w, d, h, type, color) {
    const rect = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
    if (rect.x0 < bounds.x0 + 20 || rect.x1 > bounds.x1 - 20) return false;
    if (rect.z0 < bounds.z0 + 20 || rect.z1 > bounds.z1 - 20) return false;
    // Clear of water, park, plaza and beach.
    for (const r of water) if (rectsOverlap(rect, r, 6)) return false;
    if (rectsOverlap(rect, park, 8)) return false;
    if (rectsOverlap(rect, { x0: plaza.x - plaza.half, z0: plaza.z - plaza.half, x1: plaza.x + plaza.half, z1: plaza.z + plaza.half }, 6)) return false;
    for (const r of beach) if (rectsOverlap(rect, r, 4)) return false;
    // Clear of every street, by bounding circle — the same rule the
    // verifier checks (centre within half the road plus half the
    // building's diagonal plus 2 means overlap). A rectangle-edge test
    // is too lax for square buildings: their corners clear the road
    // while the centre is still inside the verifier's circle.
    const radius = Math.hypot(w, d) / 2 + 2;
    for (const s of streets) {
      if (distToSegment(x, z, s) < s.w / 2 + radius) return false;
    }
    // Clear of every building placed so far.
    for (const b of buildings) {
      if (rectsOverlap(rect, { x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 }, 5)) return false;
    }
    buildings.push({ x, z, w, d, h, type, color, roof: [color[0] * 0.62, color[1] * 0.62, color[2] * 0.62] });
    return true;
  }

  function placeGrid(step, jitter, sizeScale) {
    for (let gx = bounds.x0 + 60; gx <= bounds.x1 - 60; gx += step) {
      for (let gz = bounds.z0 + 60; gz <= bounds.z1 - 60; gz += step) {
        const x = gx + (rng() - 0.5) * jitter;
        const z = gz + (rng() - 0.5) * jitter;
        if (isWater(x, z)) continue;
        if (inRect(x, z, park)) continue;
        if (Math.abs(x - plaza.x) < plaza.half + 20 && Math.abs(z - plaza.z) < plaza.half + 20) continue;
        if (beach.some((r) => inRect(x, z, r))) continue;
        const district = districtAt(x, z);
        if (rng() < 0.14) continue; // empty lots keep the city from feeling packed solid
        const distPlaza = Math.hypot(x - plaza.x, z - plaza.z);
        let w = (18 + rng() * 34) * sizeScale;
        let d = (18 + rng() * 28) * sizeScale;
        let h;
        let type = 'brick';
        const palette = DISTRICT_PALETTES[district] || DISTRICT_PALETTES['Canal Ward'];
        let color = palette[Math.floor(rng() * palette.length)];
        if (district === 'Glasspoint') {
          h = 60 + rng() * 80;
          type = 'glass';
          color = [0.55, 0.68, 0.72];
          w = 26 + rng() * 22;
          d = 26 + rng() * 22;
        } else if (distPlaza < 350) {
          h = 45 + rng() * 40;
          if (rng() < 0.4) { type = 'glass'; color = [0.55, 0.68, 0.72]; }
        } else if (Math.abs(x - 400) < 70) {
          h = 40 + rng() * 50;
          if (rng() < 0.45) { type = 'glass'; color = [0.55, 0.68, 0.72]; }
        } else if (district === 'Citrus Quarter') {
          h = 16 + rng() * 24;
          if (rng() < 0.3) { type = 'house'; }
        } else if (district === 'Canal Ward') {
          h = 20 + rng() * 30;
        } else if (district === 'South Market') {
          h = 14 + rng() * 12;
          if (rng() < 0.4) { type = 'market'; color = [0.75, 0.6, 0.4]; }
        } else if (district === 'Old Solmar') {
          h = 12 + rng() * 14;
          w = 16 + rng() * 22;
          d = 16 + rng() * 20;
        } else if (district === 'Sunstrand Beach') {
          h = 10 + rng() * 10;
          type = 'house';
        } else if (district === 'Pearl Marina') {
          h = 16 + rng() * 16;
        } else {
          h = 14 + rng() * 22;
        }
        // Warehouses by the harbour quay.
        if (z > 1000 && z < 1250 && Math.abs(x) < 700 && rng() < 0.6) {
          type = 'warehouse';
          color = [0.6, 0.58, 0.5];
          w = 40 + rng() * 20;
          d = 30 + rng() * 15;
          h = 12 + rng() * 6;
        }
        tryPlace(x, z, w, d, h, type, color);
      }
    }
  }
  placeGrid(95, 46, 1);
  if (buildings.length < 300) placeGrid(62, 30, 0.7);

  // ---- trees, lamps, boats, intersections --------------------------------
  const trees = [];
  for (let i = 0; i < 150; i++) {
    const x = park.x0 + 20 + rng() * (park.x1 - park.x0 - 40);
    const z = park.z0 + 20 + rng() * (park.z1 - park.z0 - 40);
    // The park has local streets crossing it; keep trees off them.
    if (nearStreet(x, z, 13)) continue;
    trees.push({ x, z, s: 0.8 + rng() * 0.7, hue: rng() });
  }
  for (let z = -1600; z <= 1100; z += 90) {
    for (const side of [-1, 1]) {
      const x = side * (95 + rng() * 18);
      const zz = z + (rng() - 0.5) * 30;
      // Skip the spots where a bridge street crosses the promenade.
      if (nearStreet(x, zz, 13)) continue;
      trees.push({ x, z: zz, s: 0.7 + rng() * 0.5, hue: rng() });
    }
  }
  let scattered = 0;
  let guard = 0;
  while (scattered < 80 && guard++ < 2000) {
    const x = bounds.x0 + 60 + rng() * (bounds.x1 - bounds.x0 - 120);
    const z = bounds.z0 + 60 + rng() * (bounds.z1 - bounds.z0 - 120);
    if (isWater(x, z)) continue;
    if (inRect(x, z, park)) continue;
    if (nearStreet(x, z, 13)) continue;
    if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 4 && Math.abs(z - b.z) < b.d / 2 + 4)) continue;
    trees.push({ x, z, s: 0.7 + rng() * 0.6, hue: rng() });
    scattered++;
  }

  const lamps = [];
  for (let z = -1700; z <= 1150; z += 90) {
    lamps.push({ x: 400 - 22, z });
    lamps.push({ x: 400 + 22, z: z + 45 });
  }
  for (const cx of [-1600, -1200, -800, -400, 200, 800, 1200, 1600]) {
    for (let z = -1600; z <= 1600; z += 180) {
      lamps.push({ x: cx + 12, z });
    }
  }
  for (let z = -1500; z <= 1100; z += 150) {
    lamps.push({ x: -90, z });
    lamps.push({ x: 90, z: z + 75 });
  }

  const boats = [];
  for (let i = 0; i < 5; i++) {
    boats.push({
      x: -380 + rng() * 760,
      z: 1300 + rng() * 340,
      heading: (rng() - 0.5) * 0.9,
      len: 26 + rng() * 18,
      color: [[0.9, 0.9, 0.88], [0.85, 0.5, 0.4], [0.4, 0.6, 0.7]][i % 3],
    });
  }

  const intersections = [];
  for (const nx of [-1600, -1200, -800, -400, 200, 400, 800, 1200, 1600]) {
    for (const ez of [-1400, -1000, -600, -200, 0, 200, 600, 1000, 1400]) {
      if (isWater(nx, ez)) continue;
      if (Math.abs(nx - 400) < 30 && Math.abs(ez - 300) < 130) continue; // the plaza has no signals
      intersections.push({ x: nx, z: ez });
    }
  }

  // ---- parked cars, taxis, people on foot -----------------------------------
  // Parked cars line the kerb (never the middle of the road, never the
  // plaza, never the water). Three bright yellow taxis on the boulevard
  // are the one moving colour a player spots from a block away. People
  // stand on sidewalks by the boulevard, the plaza edge and the canal
  // promenade, in bright varied jackets. All static in Stage A; Stage B
  // makes the cars drive and the people walk.
  const cars = [];
  const carColors = [[0.75, 0.75, 0.78], [0.35, 0.4, 0.5], [0.6, 0.25, 0.22], [0.3, 0.45, 0.4], [0.55, 0.55, 0.6]];
  for (let i = 0; i < 18; i++) {
    const z = -1500 + i * 170 + rng() * 60;
    if (Math.abs(z - 300) < 140) continue; // the plaza has no parked cars
    if (z >= 1180) continue; // the boulevard ends at the harbour water
    cars.push({ x: 400 + (i % 2 ? 20 : -20), z, angle: 0, color: carColors[i % carColors.length], taxi: false });
  }
  for (const tz of [-600, 100, 900]) {
    cars.push({ x: 420, z: tz, angle: 0, color: [0.95, 0.8, 0.1], taxi: true });
  }
  for (const [cx, cz] of [[-1200, 200], [800, -600], [1200, 600], [-800, -1000], [200, 1000], [-400, 1100]]) {
    cars.push({ x: cx, z: cz, angle: 90, color: carColors[Math.floor(rng() * carColors.length)], taxi: false });
  }

  // Drivable cars: the three yellow taxis are sedans, and three parked
  // cars near the spawn are the other profiles. A drivable car carries
  // a `profile` (and a heading in radians); the renderer skips profiled
  // cars in the static pass and draws them dynamically instead, so the
  // one the player takes does not stay behind as a ghost. The spawn is
  // on the boulevard near z=860, so the compact and the van sit within
  // a short walk of it and the coupe waits on the 800 street.
  for (const c of cars) {
    if (c.taxi) {
      c.profile = 'sedan';
      c.heading = Math.PI;
    }
  }
  const nearestBoulevard = (z) => {
    let best = null;
    for (const c of cars) {
      if (c.profile || Math.abs(c.x - 400) > 25) continue;
      if (!best || Math.abs(c.z - z) < Math.abs(best.z - z)) best = c;
    }
    return best;
  };
  const compact = nearestBoulevard(710);
  if (compact) {
    compact.profile = 'compact';
    compact.heading = Math.PI;
  }
  const van = nearestBoulevard(1050);
  if (van) {
    van.profile = 'van';
    van.heading = Math.PI;
  }
  const coupe = cars.find((c) => c.x === 800 && c.z === -600);
  if (coupe) {
    coupe.profile = 'coupe';
    coupe.heading = Math.PI;
  }

  const pedestrians = [];
  const pedColors = [[0.85, 0.45, 0.35], [0.25, 0.6, 0.6], [0.95, 0.8, 0.15], [0.4, 0.6, 0.35], [0.7, 0.4, 0.6], [0.9, 0.9, 0.85]];
  for (let i = 0; i < 12; i++) {
    const z = -1400 + i * 230 + rng() * 80;
    if (Math.abs(z - 300) < 140) continue; // not in the plaza
    if (z >= 1180) continue; // not in the harbour water
    pedestrians.push({ x: 400 + (i % 2 ? 21.5 : -21.5), z, color: pedColors[i % pedColors.length] });
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.3;
    pedestrians.push({ x: 400 + Math.cos(a) * 125, z: 300 + Math.sin(a) * 125, color: pedColors[(i + 2) % pedColors.length] });
  }
  for (let i = 0; i < 6; i++) {
    pedestrians.push({ x: i % 2 ? 88 : -88, z: -1200 + i * 420, color: pedColors[(i + 4) % pedColors.length] });
  }

  const city = {
    seed,
    bounds,
    water,
    beach,
    park,
    plaza,
    landmarks: {
      clockTower: { x: 400, z: 190, w: 14, h: 62 },
      fountain: { x: 400, z: 300, r: 16 },
    },
    streets,
    bridges,
    buildings,
    trees,
    lamps,
    boats,
    intersections,
    cars,
    pedestrians,
    counts: {
      buildings: buildings.length,
      trees: trees.length,
      lamps: lamps.length,
      boats: boats.length,
      streets: streets.length,
      intersections: intersections.length,
      cars: cars.length,
      pedestrians: pedestrians.length,
    },
    isWater,
    groundAt(x, z) {
      if (isWater(x, z)) return 'water';
      if (beach.some((r) => inRect(x, z, r))) return 'sand';
      if (inRect(x, z, park)) return 'park';
      if (Math.abs(x - plaza.x) < plaza.half && Math.abs(z - plaza.z) < plaza.half) return 'plaza';
      return 'grass';
    },
  };
  return city;
}

// The layout verifier: every placement rule above, checked again from the
// finished city. An empty array means the layout is clean.
export function verifyLayout(city) {
  const problems = [];
  const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  if (city.buildings.length < 250) problems.push(`only ${city.buildings.length} buildings (need 250+)`);
  for (const b of city.buildings) {
    const corners = [
      [b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2],
      [b.x - b.w / 2, b.z + b.d / 2], [b.x + b.w / 2, b.z + b.d / 2],
    ];
    for (const [cx, cz] of corners) {
      if (city.isWater(cx, cz)) { problems.push(`building at (${b.x.toFixed(0)},${b.z.toFixed(0)}) stands in water`); break; }
    }
    if (inRect(b.x, b.z, city.park)) problems.push(`building at (${b.x.toFixed(0)},${b.z.toFixed(0)}) stands in the park`);
    for (const s of city.streets) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      let t = len2 === 0 ? 0 : ((b.x - s.ax) * dx + (b.z - s.az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(b.x - (s.ax + t * dx), b.z - (s.az + t * dz));
      if (dist < s.w / 2 + Math.hypot(b.w, b.d) / 2 + 2) {
        problems.push(`building at (${b.x.toFixed(0)},${b.z.toFixed(0)}) overlaps a street`);
        break;
      }
    }
  }
  for (let i = 0; i < city.buildings.length; i++) {
    const a = city.buildings[i];
    for (let j = i + 1; j < city.buildings.length; j++) {
      const b = city.buildings[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 3 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 3) {
        problems.push(`buildings at (${a.x.toFixed(0)},${a.z.toFixed(0)}) and (${b.x.toFixed(0)},${b.z.toFixed(0)}) overlap`);
      }
    }
  }
  if (city.trees.length < 150) problems.push(`only ${city.trees.length} trees (need 150+)`);
  for (const t of city.trees) {
    if (city.isWater(t.x, t.z)) { problems.push(`tree at (${t.x.toFixed(0)},${t.z.toFixed(0)}) stands in water`); continue; }
    for (const s of city.streets) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      let tt = len2 === 0 ? 0 : ((t.x - s.ax) * dx + (t.z - s.az) * dz) / len2;
      tt = Math.max(0, Math.min(1, tt));
      const dist = Math.hypot(t.x - (s.ax + tt * dx), t.z - (s.az + tt * dz));
      if (dist < s.w / 2 + 13) { problems.push(`tree at (${t.x.toFixed(0)},${t.z.toFixed(0)}) stands in a street`); break; }
    }
  }
  if (city.lamps.length < 80) problems.push(`only ${city.lamps.length} lamps (need 80+)`);
  for (const br of city.bridges) {
    if (!(br.x0 <= -70 && br.x1 >= 70)) problems.push(`bridge at z=${br.zc} does not span the canal`);
  }
  for (const boat of city.boats) {
    if (!city.isWater(boat.x, boat.z)) problems.push(`boat at (${boat.x.toFixed(0)},${boat.z.toFixed(0)}) is not in the water`);
  }
  for (const c of city.cars) {
    if (city.isWater(c.x, c.z)) problems.push(`car at (${c.x.toFixed(0)},${c.z.toFixed(0)}) stands in water`);
    if (Math.abs(c.x - city.plaza.x) < city.plaza.half && Math.abs(c.z - city.plaza.z) < city.plaza.half) {
      problems.push(`car at (${c.x.toFixed(0)},${c.z.toFixed(0)}) stands in the plaza`);
    }
  }
  for (const p of city.pedestrians) {
    if (city.isWater(p.x, p.z)) problems.push(`pedestrian at (${p.x.toFixed(0)},${p.z.toFixed(0)}) stands in water`);
  }
  return problems;
}
