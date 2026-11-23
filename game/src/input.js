// Palkon Auto — keyboard and mouse input (Stage A).
// Drag orbits the camera, the wheel zooms, 1/2/3 switch the light preset
// and T cycles it. Movement keys arrive in later stages; this stage is
// look-around only, so the city can be inspected from anywhere.

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

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') setPreset('day');
    else if (e.code === 'Digit2') setPreset('sunset');
    else if (e.code === 'Digit3') setPreset('night');
    else if (e.code === 'KeyT') setPreset('cycle');
  });
}
