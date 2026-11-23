// Palkon Auto — Stage B: driving, traffic, headlights.
// Boots the renderer, the minimap and the HUD, then runs the frame loop.
// Mara walks the city on foot (WASD, 6 m/s); E enters the nearest
// drivable car (open door, "E — Drive" prompt) and exits it again.
// Fifteen traffic cars drive loops and stop at red lights on a 26 s
// cycle; twenty-five people walk the sidewalks, the plaza and the
// promenade. The player's headlights are 4 world-space spot cones that
// genuinely light the road and the cars ahead of them.
// URL parameters stage a view without touching the code:
//   ?preset=day|sunset|night   the light (1/2/3 or T in game)
//   ?cam=x,y,z&target=x,y,z    an exact camera placement
//   ?shot=day-boulevard|sunset|night|plaza  a staged screenshot view
//   ?haze=off                  disable the decorative haze (fog)
//   ?test=headlight            the scripted headlight test (night, the
//                              coupe on the boulevard, a sedan ahead):
//                              renders lights-on and lights-off, samples
//                              the asphalt, the roof and an unlit patch,
//                              and reports the rises in __palkon.test.
import { buildCity, verifyLayout, districtAt, CITY_SEED } from './city.js';
import { createRenderer } from './renderer.js';
import { createCamera } from './camera.js';
import { createInput } from './input.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';
import { PRESET_ORDER } from './lighting.js';
import { createVehicle, stepVehicle, createWalker, stepWalker, PROFILES } from './vehicle.js';
import { createTraffic, stepTraffic, stepPedestrians, lightPhase } from './traffic.js';
import { circleRect, buildObstacleGrid, buildStaticObstacles, resolveVehicleRect } from './collision.js';

// Staged screenshot views: street and promenade level, never from above.
// The camera sits on a street at about head height, looking down it, so
// buildings line both sides of the frame.
const SHOTS = {
  'day-boulevard': {
    preset: 'day',
    eye: [415, 7, 750],
    target: [380, 14, -300],
  },
  sunset: {
    preset: 'sunset',
    // On Old Solmar's diagonal avenue, looking north-east along it
    // toward the centre: low houses both sides, warm west light.
    eye: [-1220, 7, -1140],
    target: [-800, 14, -800],
  },
  night: {
    preset: 'night',
    eye: [400, 6, 1150],
    target: [400, 10, 200],
  },
  plaza: {
    preset: 'day',
    // On the boulevard just south of the plaza, looking north across
    // it at the clock tower and the skyline behind it.
    eye: [400, 12, 480],
    target: [400, 18, 280],
  },
};

window.__palkon = { errors: [], ready: false, shots: Object.keys(SHOTS), test: null };
window.addEventListener('error', (e) => {
  window.__palkon.errors.push(String(e.message || e.error));
  document.title = 'PAGEERROR: ' + (e.message || 'unknown');
});
window.addEventListener('unhandledrejection', (e) => {
  window.__palkon.errors.push('rejection: ' + String(e.reason));
});

const params = new URLSearchParams(location.search);
const city = buildCity(CITY_SEED);
const layoutProblems = verifyLayout(city);
if (layoutProblems.length > 0) {
  console.error('layout problems:', layoutProblems.join(' | '));
  window.__palkon.errors.push('layout: ' + layoutProblems.join(' | '));
}
window.__palkon.counts = city.counts;
window.__palkon.layoutProblems = layoutProblems;

const obstacles = buildStaticObstacles(city);
const obstacleGrid = buildObstacleGrid(obstacles);
const traffic = createTraffic(city);

// Drivable cars: the profiled cars from the city, as live vehicles.
// The rest of the parked cars stay in the static buffer as props.
const drivableCars = city.cars
  .filter((c) => c.profile)
  .map((c) => createVehicle(c.profile, c.x, c.z, c.heading ?? Math.PI, c.color, !!c.taxi));

// Mara spawns on the boulevard's east sidewalk, a short walk from the
// taxi at (420, 900) and the compact near z=710.
const mara = createWalker(421, 860);
let playerCar = null;
let gameTime = 0;
let shake = { t: 0, amp: 0 };
let particles = [];
// Extra cars drawn dynamically but owned by nobody (the headlight test
// parks a sedan ahead of the player for its roof patch).
let extraCars = [];

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas, city);
const camera = createCamera();
const minimap = createMinimap(document.getElementById('minimap'), city);
const hud = createHud();

let presetName = 'day';
function setPreset(name) {
  if (name === 'cycle') {
    const i = PRESET_ORDER.indexOf(presetName);
    name = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
  }
  presetName = name;
  renderer.setPreset(name);
}
const input = createInput(canvas, camera, setPreset);

// Stage the camera from the URL, or start on the opening overview.
const shot = SHOTS[params.get('shot') || ''];
const staged = !!shot || !!(params.get('cam') && params.get('target'));
if (shot) {
  setPreset(shot.preset);
  camera.place(shot.eye, shot.target);
} else {
  const cam = params.get('cam');
  const tgt = params.get('target');
  if (cam && tgt) {
    setPreset(params.get('preset') || 'day');
    camera.place(cam.split(',').map(Number), tgt.split(',').map(Number));
  } else {
    setPreset(params.get('preset') || 'day');
    // The opening vista: high over the boulevard south of the plaza,
    // looking north up Solmar Avenue at the clock tower and the skyline
    // — Mara in the lower frame, the city itself on the first frame.
    camera.place([400, 55, 1010], [421, 4, 860]);
  }
}
if (params.get('haze') === 'off') {
  // The haze is the renderer's fog; turning it off is a debug view.
  renderer.setHazeEnabled(false);
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---- collision ------------------------------------------------------------
// The player's car against buildings, water, landmarks, parked props and
// the traffic cars. Traffic rectangles are rebuilt every frame from the
// cars' live positions.
function resolveVehicle(v) {
  const dyn = traffic.cars.map((c) => ({ cx: c.x, cz: c.z, hw: 1.0, hd: 2.2, rot: c.heading }));
  return resolveVehicleRect(v, obstacleGrid, dyn);
}

// Mara on foot: a circle against buildings, water and landmarks, and
// against every car as a circle of radius 2.4.
function resolveWalker(w) {
  const nearby = obstacleGrid.query(w.x - 3, w.z - 3, w.x + 3, w.z + 3);
  for (const o of nearby) {
    if (o.kind === 'car') continue; // cars are circles below, not boxes
    const res = circleRect(w.x, w.z, w.radius, { x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1 });
    if (res) {
      w.x += res.nx * res.depth;
      w.z += res.nz * res.depth;
    }
  }
  for (const car of drivableCars) {
    pushWalkerOutOfCar(w, car);
  }
  for (const car of traffic.cars) {
    pushWalkerOutOfCar(w, car);
  }
}

function pushWalkerOutOfCar(w, car) {
  const dx = w.x - car.x;
  const dz = w.z - car.z;
  const d = Math.hypot(dx, dz);
  const min = w.radius + 2.4;
  if (d < min && d > 1e-6) {
    w.x = car.x + (dx / d) * min;
    w.z = car.z + (dz / d) * min;
  }
}

function nearestDrivable(x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of drivableCars) {
    if (car === playerCar) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

// ---- headlights -----------------------------------------------------------
// Four world-space spot cones: two headlights, each with a wide near cone
// and a narrow far cone. The near cone splays slightly outward, the far
// cone runs straight ahead; both tilt gently down onto the road.
function headlightSpots(car) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  const norm3 = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const spots = [];
  for (const side of [-1, 1]) {
    const px = car.x + fx * 2.3 + rx * side * 0.7;
    const pz = car.z + fz * 2.3 + rz * side * 0.7;
    spots.push({
      pos: [px, 0.8, pz],
      dir: norm3([fx + rx * side * 0.12, -0.05, fz + rz * side * 0.12]),
      color: [2.2, 2.0, 1.6],
      cosOuter: Math.cos((28 * Math.PI) / 180),
      cosInner: Math.cos((18 * Math.PI) / 180),
    });
    spots.push({
      pos: [px, 0.8, pz],
      dir: norm3([fx, -0.045, fz]),
      color: [3.0, 2.8, 2.2],
      cosOuter: Math.cos((16 * Math.PI) / 180),
      cosInner: Math.cos((10 * Math.PI) / 180),
    });
  }
  return spots;
}

// ---- dust and camera shake ------------------------------------------------
function spawnDust(x, z, nx, nz, speed) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    particles.push({
      x, y: 0.4 + Math.random() * 0.8, z,
      vx: Math.cos(a) * sp + nx * speed * 0.3,
      vy: 1 + Math.random() * 2,
      vz: Math.sin(a) * sp + nz * speed * 0.3,
      life: 0.5 + Math.random() * 0.3, maxLife: 0.8,
      size: 0.3 + Math.random() * 0.25,
    });
  }
  if (particles.length > 120) particles.splice(0, particles.length - 120);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 9 * dt;
    if (p.y < 0.1) {
      p.y = 0.1;
      p.vy = 0;
    }
  }
  particles = particles.filter((p) => p.life > 0);
}

function onImpact(impact, car) {
  if (!impact || impact.speed < 3) return;
  shake.t = 0.35;
  shake.amp = Math.min(0.9, impact.speed * 0.06);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  spawnDust(car.x + fx * 2.2, car.z + fz * 2.2, impact.nx, impact.nz, impact.speed);
}

// ---- dynamic scene ----------------------------------------------------------
const SIGNAL_COLORS = {
  green: [0.15, 0.9, 0.2],
  yellow: [0.95, 0.8, 0.15],
  red: [1.0, 0.1, 0.08],
};

function drawCarShape(car) {
  renderer.box(car.x, 0.7, car.z, 2.0, 1.1, 4.4, car.color, { rot: car.heading, spec: 0.5 });
  renderer.box(car.x, 1.5, car.z, 1.8, 0.7, 2.4, [0.15, 0.16, 0.18], { rot: car.heading, spec: 0.6 });
  if (car.taxi) renderer.box(car.x, 2.05, car.z, 0.5, 0.35, 1.0, [0.15, 0.15, 0.15], { rot: car.heading, emissive: [0.9, 0.8, 0.2] });
  // Headlight dots at the front corners: the visible light source.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  for (const side of [-1, 1]) {
    renderer.box(
      car.x + fx * 2.25 + rx * side * 0.7, 0.75, car.z + fz * 2.25 + rz * side * 0.7,
      0.3, 0.22, 0.12, [0.9, 0.9, 0.85], { rot: car.heading, emissive: [1.0, 0.98, 0.85] },
    );
  }
}

function drawOpenDoor(car) {
  // A drivable car shows its driver door swung open, so the player never
  // has to guess which parked cars can be taken.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const lx = -Math.cos(car.heading);
  const lz = Math.sin(car.heading);
  renderer.box(
    car.x + fx * 0.8 + lx * 1.15, 0.9, car.z + fz * 0.8 + lz * 1.15,
    0.08, 1.0, 1.1, [0.12, 0.12, 0.14], { rot: car.heading + 1.1, spec: 0.4 },
  );
}

function drawPerson(x, z, color) {
  renderer.cone(x, 0, z, 0.6, 2.3, 6, color);
  renderer.box(x, 2.6, z, 0.75, 0.75, 0.75, [0.85, 0.7, 0.55]);
}

function drawDynamic() {
  renderer.startDynamic();
  const phase = lightPhase(gameTime);
  for (const inter of city.intersections) {
    renderer.box(inter.x + 14, 7.3, inter.z + 14.6, 0.5, 0.5, 0.2, [0.2, 0.2, 0.2], { emissive: SIGNAL_COLORS[phase.ns] });
    renderer.box(inter.x - 14, 7.3, inter.z - 14.6, 0.5, 0.5, 0.2, [0.2, 0.2, 0.2], { emissive: SIGNAL_COLORS[phase.ew] });
  }
  for (const car of drivableCars) {
    drawCarShape(car);
    if (car !== playerCar) drawOpenDoor(car);
  }
  for (const car of extraCars) drawCarShape(car);
  for (const car of traffic.cars) drawCarShape(car);
  for (const p of traffic.peds) drawPerson(p.x, p.z, p.color);
  if (!playerCar) {
    // Mara on foot: a coral jacket, a head, dark hair.
    renderer.cone(mara.x, 0, mara.z, 0.62, 2.3, 6, [0.84, 0.5, 0.41]);
    renderer.box(mara.x, 2.6, mara.z, 0.75, 0.75, 0.75, [0.85, 0.7, 0.55]);
    renderer.box(mara.x, 3.05, mara.z, 0.8, 0.25, 0.8, [0.16, 0.12, 0.1]);
  }
  for (const pt of particles) {
    const s = pt.size * (0.3 + 0.7 * (pt.life / pt.maxLife));
    renderer.box(pt.x, pt.y, pt.z, s, s, s, [0.7, 0.6, 0.5], { emissive: [1.0, 0.55, 0.15] });
  }
  return renderer.finishDynamic();
}

// ---- headlight test ---------------------------------------------------------
// ?test=headlight: night, the coupe on a free stretch of the boulevard
// with a sedan parked 60 units ahead of it, the camera behind the car.
// Renders once with the headlights on and once with them off, samples
// the asphalt ahead, the sedan's roof and a patch outside the beam, and
// reports the mean rise and the share of pixels up more than 10.
const sampleCanvas = document.createElement('canvas');
let sampleCtx = null;
let testDone = false;

function readLuminance(cx, cy, half) {
  sampleCtx.drawImage(canvas, 0, 0);
  const x0 = Math.max(0, Math.floor(cx - half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const x1 = Math.min(canvas.width, Math.ceil(cx + half));
  const y1 = Math.min(canvas.height, Math.ceil(cy + half));
  const img = sampleCtx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const d = img.data;
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  return out;
}

function compareRegions(on, off) {
  let sum = 0;
  let over = 0;
  let onSum = 0;
  let offSum = 0;
  for (let i = 0; i < on.length; i++) {
    const rise = on[i] - off[i];
    sum += rise;
    if (rise > 10) over++;
    onSum += on[i];
    offSum += off[i];
  }
  // The absolute means diagnose a zero rise: both bright means the
  // lights never turned off, both dark means the beam never reached
  // the sample point (or the point is off the lit surface).
  return {
    meanRise: sum / on.length, fracOver10: over / on.length, n: on.length,
    onMean: onSum / on.length, offMean: offSum / off.length,
  };
}

function runHeadlightTest() {
  setPreset('night');
  // Find a free stretch of the boulevard: no parked car within 9 units
  // of the player spot or the target spot 60 units ahead of it.
  let z0 = 1150;
  outer: for (let z = 1150; z >= 600; z -= 5) {
    for (const c of city.cars) {
      if (Math.abs(c.x - 400) > 25) continue;
      if (Math.abs(c.z - z) < 9 || Math.abs(c.z - (z - 60)) < 9) continue outer;
    }
    z0 = z;
    break;
  }
  const testCar = createVehicle('coupe', 400, z0, Math.PI, [0.35, 0.4, 0.5]);
  const targetCar = createVehicle('sedan', 400, z0 - 60, Math.PI, [0.6, 0.25, 0.22]);
  playerCar = testCar;
  extraCars = [targetCar];
  camera.place([400, 6.5, z0 + 32], [400, 2, z0 - 45]);
  // Point the renderer at the test camera BEFORE projecting the sample
  // points: projectPoint reads the renderer's view matrix, and until
  // setCamera runs it still holds the previous frame's camera, so the
  // sample boxes would land on the wrong part of the image. (This was
  // the Stage B headlight-test failure: every region measured a rise
  // of exactly 0 because the boxes sampled unrelated pixels.)
  renderer.setCamera(camera.eye(), camera.target);
  sampleCanvas.width = canvas.width;
  sampleCanvas.height = canvas.height;
  // willReadFrequently: the test reads the canvas back six times.
  sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const spots = headlightSpots(testCar);
  const pts = {
    asphalt: renderer.projectPoint([400, 0.1, z0 - 50]),
    roof: renderer.projectPoint([400, 1.85, z0 - 60]),
    // The unlit control sits well outside the beam: the wide near cone
    // (28 degrees, splayed outward) reaches about x=366 at this range,
    // so x=364 was only two units past its edge and the sample box
    // caught the penumbra. x=330 is seventy units off the centreline,
    // clearly beyond any spill.
    unlit: renderer.projectPoint([330, 0.1, z0 - 50]),
  };
  const renderOnce = (sp) => {
    renderer.setCamera(camera.eye(), camera.target);
    renderer.setSpots(sp);
    renderer.render();
    drawDynamic();
    renderer.gl.finish();
  };
  renderOnce(spots);
  const on = {
    asphalt: readLuminance(pts.asphalt[0], pts.asphalt[1], 20),
    roof: readLuminance(pts.roof[0], pts.roof[1], 20),
    unlit: readLuminance(pts.unlit[0], pts.unlit[1], 20),
  };
  renderOnce([]);
  const off = {
    asphalt: readLuminance(pts.asphalt[0], pts.asphalt[1], 20),
    roof: readLuminance(pts.roof[0], pts.roof[1], 20),
    unlit: readLuminance(pts.unlit[0], pts.unlit[1], 20),
  };
  const asphalt = compareRegions(on.asphalt, off.asphalt);
  const roof = compareRegions(on.roof, off.roof);
  const unlit = compareRegions(on.unlit, off.unlit);
  window.__palkon.test = {
    haze: params.get('haze') === 'off' ? 'off' : 'on',
    playerZ: z0,
    pts: {
      asphalt: pts.asphalt.map((v) => +v.toFixed(1)),
      roof: pts.roof.map((v) => +v.toFixed(1)),
      unlit: pts.unlit.map((v) => +v.toFixed(1)),
    },
    asphalt, roof, unlit,
    pass: asphalt.meanRise >= 20 && asphalt.fracOver10 >= 0.9 &&
      roof.meanRise >= 20 && roof.fracOver10 >= 0.9 &&
      Math.abs(unlit.meanRise) <= 1,
  };
  // One last render with the lights back on, so the screenshot the
  // driver takes shows the beam.
  renderOnce(spots);
  testDone = true;
  window.__palkon.ready = true;
}

// ---- frame loop ---------------------------------------------------------------
let last = performance.now();
let frames = 0;
let fps = 0;
let fpsTime = last;
// Start at 0, not at load time: the first frame must update the HUD
// immediately, or a one-frame (?still=1) render keeps the HTML defaults.
let hudTime = 0;

// ?still=1 renders exactly one frame and stops: the staged screenshot
// views need one settled frame, not a running loop, and on SwiftShader a
// running loop costs minutes per shot.
const still = params.get('still') === '1';
const testMode = params.get('test') || '';

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (testMode === 'headlight' && !testDone) {
    runHeadlightTest();
    if (!still) requestAnimationFrame(frame);
    return;
  }
  frames++;
  if (now - fpsTime >= 1000) {
    fps = (frames * 1000) / (now - fpsTime);
    frames = 0;
    fpsTime = now;
  }
  // E enters and exits the car, once per frame.
  if (input.pressed.has('KeyE')) {
    if (playerCar) {
      // Out on the driver's side, three units left of the car.
      const rx = Math.cos(playerCar.heading);
      const rz = -Math.sin(playerCar.heading);
      mara.x = playerCar.x - rx * 3;
      mara.z = playerCar.z - rz * 3;
      mara.heading = playerCar.heading;
      playerCar.speed = 0;
      playerCar = null;
    } else {
      const near = nearestDrivable(mara.x, mara.z, 4.5);
      if (near) {
        playerCar = near;
        playerCar.speed = 0;
        mara.x = near.x;
        mara.z = near.z;
      }
    }
  }
  // Fixed physics substeps, so the drive is the same at any frame rate.
  const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    gameTime += sdt;
    if (playerCar) {
      stepVehicle(playerCar, input.drive(), sdt, resolveVehicle);
      if (playerCar.impact) onImpact(playerCar.impact, playerCar);
    } else {
      const [mx, mz] = input.walk(camera.yaw);
      stepWalker(mara, mx, mz, sdt, resolveWalker);
    }
    stepTraffic(traffic, gameTime, sdt, playerCar);
    stepPedestrians(traffic, sdt, [playerCar, ...traffic.cars].filter(Boolean));
    updateParticles(sdt);
  }
  input.clearPressed();
  // The camera: a chase view behind the car, a free orbit around Mara
  // on foot. Staged views (?shot=, ?cam=) keep their placement.
  if (!staged) {
    if (playerCar) {
      camera.chase(playerCar, dt);
    } else {
      camera.follow(mara.x, mara.z);
      if (!camera.userZoomed && camera.dist > 32) {
        camera.dist += (30 - camera.dist) * (1 - Math.exp(-1.2 * dt));
      }
    }
  }
  let eye = camera.eye();
  if (shake.t > 0) {
    const s = shake.amp * (shake.t / 0.35);
    eye = [
      eye[0] + (Math.random() - 0.5) * s,
      eye[1] + (Math.random() - 0.5) * s * 0.6,
      eye[2] + (Math.random() - 0.5) * s,
    ];
    shake.t -= dt;
  }
  renderer.setCamera(eye, camera.target);
  renderer.setSpots(playerCar ? headlightSpots(playerCar) : []);
  renderer.render();
  const dynVerts = drawDynamic();
  minimap.draw(camera, {
    player: playerCar ? { x: playerCar.x, z: playerCar.z } : { x: mara.x, z: mara.z },
    traffic: traffic.cars,
    drivable: drivableCars,
  });
  const speedKmh = (playerCar ? Math.abs(playerCar.speed) : mara.speed) * 3.6;
  if (now - hudTime >= 250) {
    let prompt = '';
    if (playerCar) {
      prompt = 'E — Get out';
    } else {
      const near = nearestDrivable(mara.x, mara.z, 4.5);
      if (near) {
        prompt = near.taxi ? 'E — Drive the taxi' : `E — Drive the ${PROFILES[near.profile].label.toLowerCase()}`;
      }
    }
    hud.prompt(prompt);
    hud.update({
      district: districtAt(camera.target[0], camera.target[2]),
      preset: presetName,
      fps: Math.round(fps),
      yaw: camera.yaw,
      speed: speedKmh,
    });
    hudTime = now;
  }
  if (!window.__palkon.ready) {
    window.__palkon.ready = true;
    window.__palkon.dynVerts = dynVerts;
  }
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
