// Palkon Auto — the minimap (Stage A).
// A small 2D canvas in the corner: water, park, beach, streets (drawn at
// their real widths, the boulevard thick and coral), buildings coloured by
// their district so each quarter reads at a glance, the plaza, and a
// marker for where the camera is looking. The same drawing is reused by
// later stages, which add the player, traffic and police dots.

import { districtAt } from './city.js';

const DISTRICT_MINIMAP = {
  'Old Solmar': '#b98a5a',
  'Canal Ward': '#a85a4a',
  'South Market': '#c08a4a',
  'Citrus Quarter': '#7a9a4a',
  'Pearl Marina': '#8aa8b8',
  'Glasspoint': '#6a8a9a',
  'Sunstrand Beach': '#d8a08a',
};

export function createMinimap(canvas, city) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const bx = city.bounds;
  const sx = W / (bx.x1 - bx.x0);
  const sy = H / (bx.z1 - bx.z0);
  const X = (x) => (x - bx.x0) * sx;
  const Z = (z) => (z - bx.z0) * sy;

  function draw(camera, extras) {
    ctx.clearRect(0, 0, W, H);
    // Land.
    ctx.fillStyle = '#c9bd9a';
    ctx.fillRect(0, 0, W, H);
    // Park and beach.
    ctx.fillStyle = '#6f9a55';
    ctx.fillRect(X(city.park.x0), Z(city.park.z0), (city.park.x1 - city.park.x0) * sx, (city.park.z1 - city.park.z0) * sy);
    ctx.fillStyle = '#e2cd96';
    for (const b of city.beach) {
      ctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sx, (b.z1 - b.z0) * sy);
    }
    // Water.
    ctx.fillStyle = '#3f8ea6';
    for (const w of city.water) {
      ctx.fillRect(X(w.x0), Z(w.z0), (w.x1 - w.x0) * sx, (w.z1 - w.z0) * sy);
    }
    // Plaza.
    ctx.fillStyle = '#d9c9a4';
    const p = city.plaza;
    ctx.fillRect(X(p.x - p.half), Z(p.z - p.half), p.half * 2 * sx, p.half * 2 * sy);
    // Streets.
    for (const s of city.streets) {
      ctx.strokeStyle = s.kind === 'boulevard' ? '#d77f69' : '#5a5648';
      ctx.lineWidth = Math.max(1, s.w * sx * 0.55);
      ctx.beginPath();
      ctx.moveTo(X(s.ax), Z(s.az));
      ctx.lineTo(X(s.bx), Z(s.bz));
      ctx.stroke();
    }
    // Buildings, coloured by district so each quarter reads at a glance.
    for (const b of city.buildings) {
      ctx.fillStyle = DISTRICT_MINIMAP[districtAt(b.x, b.z)] || '#8a7a62';
      ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(1, b.w * sx), Math.max(1, b.d * sy));
    }
    // Camera target marker.
    if (camera) {
      const t = camera.target;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#142d38';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(t[0]), Z(t[2]), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Stage B: the living map. The player is a coral dot with a white
    // ring, traffic cars are small white dots, and the cars Mara can
    // drive are yellow — the map answers "where is my car" at a glance.
    if (extras) {
      if (extras.drivable) {
        ctx.fillStyle = '#e8b400';
        for (const c of extras.drivable) {
          ctx.fillRect(X(c.x) - 1, Z(c.z) - 1, 2, 2);
        }
      }
      if (extras.traffic) {
        ctx.fillStyle = '#ffffff';
        for (const c of extras.traffic) {
          ctx.fillRect(X(c.x) - 1, Z(c.z) - 1, 2, 2);
        }
      }
      if (extras.player) {
        ctx.fillStyle = '#d77f69';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(extras.player.x), Z(extras.player.z), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  return { draw };
}
