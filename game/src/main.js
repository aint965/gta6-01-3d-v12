// Palkon Auto — Stage A: the city, the light and the camera.
// Boots the renderer, the minimap and the HUD, then runs the frame loop.
// URL parameters stage a view without touching the code:
//   ?preset=day|sunset|night   the light (1/2/3 or T in game)
//   ?cam=x,y,z&target=x,y,z    an exact camera placement
//   ?shot=day-boulevard|sunset|night|plaza  a staged screenshot view
//   ?haze=off                  disable the decorative haze (fog)
import { buildCity, verifyLayout, districtAt, CITY_SEED } from './city.js';
import { createRenderer } from './renderer.js';
import { createCamera } from './camera.js';
import { createInput } from './input.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';
import { PRESET_ORDER } from './lighting.js';

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

window.__palkon = { errors: [], ready: false, shots: Object.keys(SHOTS) };
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
    // — the city itself on the first frame, not an empty screen.
    camera.place([400, 60, 1000], [400, 15, 100]);
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

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  if (now - fpsTime >= 1000) {
    fps = (frames * 1000) / (now - fpsTime);
    frames = 0;
    fpsTime = now;
  }
  const eye = camera.eye();
  renderer.setCamera(eye, camera.target);
  renderer.render();
  minimap.draw(camera);
  if (now - hudTime >= 250) {
    hud.update({
      district: districtAt(camera.target[0], camera.target[2]),
      preset: presetName,
      fps: Math.round(fps),
      // Compass heading from the camera yaw; speed is 0 on foot in
      // Stage A and becomes the driving speed in Stage B.
      yaw: camera.yaw,
      speed: 0,
    });
    hudTime = now;
  }
  if (!window.__palkon.ready) {
    window.__palkon.ready = true;
    const eyeNow = camera.eye();
    document.getElementById('status').textContent =
      'DBG eye=' + eyeNow.map((v) => v.toFixed(1)).join(',') +
      ' target=' + camera.target.map((v) => v.toFixed(1)).join(',') +
      ' yaw=' + camera.yaw.toFixed(3) + ' pitch=' + camera.pitch.toFixed(3) +
      ' dist=' + camera.dist.toFixed(1) + ' preset=' + presetName;
  }
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
