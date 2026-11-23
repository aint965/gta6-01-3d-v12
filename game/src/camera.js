// Palkon Auto — the orbit camera (Stage A).
// A target point, a yaw and pitch around it, and a distance. place() sets
// an exact eye/target pair (used by the staged screenshot views); orbit()
// and zoom() are the interactive controls.

export function createCamera() {
  const cam = {
    target: [0, 12, -120],
    yaw: 0,
    pitch: 0.32,
    dist: 420,
    eye() {
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      return [
        this.target[0] - Math.sin(this.yaw) * cp * this.dist,
        this.target[1] + sp * this.dist,
        this.target[2] - Math.cos(this.yaw) * cp * this.dist,
      ];
    },
    place(eye, target) {
      this.target = [...target];
      const dx = eye[0] - target[0];
      const dy = eye[1] - target[1];
      const dz = eye[2] - target[2];
      this.dist = Math.hypot(dx, dy, dz);
      this.pitch = Math.asin(Math.max(-0.95, Math.min(0.95, dy / this.dist)));
      // The eye sits behind the target: yaw points from target to eye.
      this.yaw = Math.atan2(-dx, -dz);
    },
    orbit(dx, dy) {
      this.yaw -= dx * 0.005;
      this.pitch = Math.max(0.06, Math.min(1.35, this.pitch + dy * 0.003));
    },
    zoom(factor) {
      this.dist = Math.max(12, Math.min(1600, this.dist * factor));
    },
    forward() {
      return [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
    },
    right() {
      return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    },
  };
  return cam;
}
