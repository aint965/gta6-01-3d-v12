// Palkon Auto — the HUD (Stage A).
// A small overlay: the game name, the district under the camera, the light
// preset and the frame rate, plus a controls hint along the bottom. The
// compass strip and the big speedometer are permanent: the compass follows
// the camera yaw, the speedometer reads 0 on foot in Stage A and becomes
// the driving speed in Stage B. Later stages add cash, missions, wanted
// stars and health to these same nodes.

export function createHud() {
  const districtEl = document.getElementById('hud-district');
  const presetEl = document.getElementById('hud-preset');
  const fpsEl = document.getElementById('hud-fps');
  const stripEl = document.getElementById('compass-strip');
  const speedEl = document.getElementById('hud-speed-num');
  const PRESET_LABEL = { day: 'Midday', sunset: 'Sunset', night: 'Night' };

  // The compass strip: three copies of the 360-degree dial at 2px per
  // degree, so the current heading can always sit at the centre caret.
  if (stripEl && !stripEl.hasChildNodes()) {
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let copy = 0; copy < 3; copy++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const tick = document.createElement('span');
        tick.className = 'tick';
        tick.style.left = `${(copy * 360 + deg) * 2}px`;
        if (deg % 45 === 0) {
          tick.textContent = names[(deg / 45) % 8];
          tick.classList.add('cardinal');
        }
        stripEl.appendChild(tick);
      }
    }
  }

  return {
    update({ district, preset, fps, yaw, speed }) {
      if (districtEl) districtEl.textContent = district;
      if (presetEl) presetEl.textContent = PRESET_LABEL[preset] || preset;
      if (fpsEl) fpsEl.textContent = fps > 0 ? `${fps} FPS` : '';
      if (stripEl && yaw !== undefined) {
        // View direction is (sin(yaw), cos(yaw)) in (x, z); north is -z,
        // east is +x, so the heading is atan2(sin, -cos).
        const heading = (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180 / Math.PI + 360) % 360;
        stripEl.style.transform = `translateX(${110 - (heading + 360) * 2}px)`;
      }
      if (speedEl && speed !== undefined) speedEl.textContent = String(Math.round(speed));
    },
  };
}
