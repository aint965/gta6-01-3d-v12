// Palkon Auto — keyboard and mouse input (Stage B).
// Drag orbits the camera, the wheel zooms, 1/2/3 switch the light preset
// and T cycles it. WASD drives the car or walks Mara (relative to the
// camera yaw), E enters and exits a car, and the key state is exposed so
// the game loop reads it every frame instead of reacting to events.

export function createInput(canvas, camera, setPreset) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camera.orbit(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY > 0 ? 1.08 : 0.92);
  }, { passive: false });

  const keys = new Set();
  const pressed = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') setPreset('day');
    else if (e.code === 'Digit2') setPreset('sunset');
    else if (e.code === 'Digit3') setPreset('night');
    else if (e.code === 'KeyT') setPreset('cycle');
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });

  return {
    keys,
    // True only on the frame the key went down (edge-triggered actions
    // like E use this; the game clears it after each frame).
    pressed,
    clearPressed() {
      pressed.clear();
    },
    // The driving/walking input for this frame: throttle 0..1, brake,
    // steer -1..1, and the movement vector relative to the camera yaw.
    drive() {
      return {
        throttle: keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0,
        brake: keys.has('KeyS') || keys.has('ArrowDown'),
        steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0) +
          (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
      };
    },
    walk(yaw) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      let mx = 0;
      let mz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) {
        mx += fx;
        mz += fz;
      }
      if (keys.has('KeyS') || keys.has('ArrowDown')) {
        mx -= fx;
        mz -= fz;
      }
      if (keys.has('KeyD') || keys.has('ArrowRight')) {
        mx += rx;
        mz += rz;
      }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) {
        mx -= rx;
        mz -= rz;
      }
      return [mx, mz];
    },
  };
}
