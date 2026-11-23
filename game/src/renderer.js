// Palkon Auto — the handwritten WebGL 2 renderer (Stage A).
// No vendored engine: one shader program, one merged static vertex buffer
// for the whole city (buildings with lit windows, roads, water, trees,
// lamps, boats, landmarks), plus tiny separate buffers for the stars, the
// sun disc and the moon. Lighting is a directional sun/moon plus ambient,
// with per-vertex emissive for lit windows and lamp heads, a specular term
// for glass and water, and exponential fog (the haze).

import { PRESETS } from './lighting.js';

const VERT_REAL = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec3 aEmissive;
attribute float aSpec;
attribute float aFog;
uniform mat4 uProj;
uniform mat4 uView;
varying highp vec3 vWorld;
varying highp vec3 vNormal;
varying vec3 vColor;
varying vec3 vEmissive;
varying float vSpec;
varying float vFogFlag;
void main() {
  vec4 world = vec4(aPos, 1.0);
  gl_Position = uProj * uView * world;
  vWorld = aPos;
  vNormal = aNormal;
  vColor = aColor;
  vEmissive = aEmissive;
  vSpec = aSpec;
  vFogFlag = aFog;
  gl_PointSize = 2.0;
}
`;

const FRAG_REAL = `
precision mediump float;
varying highp vec3 vWorld;
varying highp vec3 vNormal;
varying vec3 vColor;
varying vec3 vEmissive;
varying float vSpec;
varying float vFogFlag;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uAmbient;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uEmissive;
uniform vec3 uSpotPos[8];
uniform vec3 uSpotDir[8];
uniform vec3 uSpotColor[8];
uniform vec2 uSpotCos[8];
uniform int uSpotCount;
void main() {
  // Lighting is per-fragment now (Stage B): the old per-vertex pass
  // could not show a headlight pool in the middle of a long road quad,
  // because the pool falls between the quad's vertices. World position
  // and normal are interpolated, so every surface gets the same light.
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 col = vColor * (uAmbient + uSunColor * diff);
  vec3 viewDir = normalize(uCamPos - vWorld);
  vec3 refl = reflect(-uSunDir, n);
  float sp = pow(max(dot(refl, viewDir), 0.0), 24.0) * vSpec;
  col += uSunColor * sp;
  // Headlights: world-space spot cones. Each cone lights the road and
  // the cars inside it; outside the cone nothing changes. The cone test
  // uses the direction FROM the light TO the surface: the surface-to-
  // light vector points the other way, so dotting it with the spot
  // direction gives about -1 and the cone is always zero. (That was
  // the Stage B headlight-test failure: every region measured a rise
  // of exactly 0, and the bright pool in the screenshot was the moon's
  // specular reflection on the road, not the headlights.)
  for (int i = 0; i < 8; i++) {
    if (i >= uSpotCount) break;
    vec3 toSurf = vWorld - uSpotPos[i];
    float dist = length(toSurf);
    vec3 sdir = toSurf / max(dist, 0.001);
    float cosA = dot(sdir, uSpotDir[i]);
    float cone = smoothstep(uSpotCos[i].x, uSpotCos[i].y, cosA);
    float atten = 1.0 / (1.0 + 0.02 * dist + 0.0004 * dist * dist);
    col += uSpotColor[i] * cone * atten;
  }
  col += vEmissive * uEmissive;
  float fogF = (1.0 - exp(-uFogDensity * length(uCamPos - vWorld))) * vFogFlag;
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  // x = normalize(cross(up, z))
  let xx = up[1] * z[2] - up[2] * z[1];
  let xy = up[2] * z[0] - up[0] * z[2];
  let xz = up[0] * z[1] - up[1] * z[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  // y = cross(z, x)
  const yx = z[1] * xz - z[2] * xy;
  const yy = z[2] * xx - z[0] * xz;
  const yz = z[0] * xy - z[1] * xx;
  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = z[0]; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = z[1]; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = z[2]; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export function createRenderer(canvas, city) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 is not available');
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_REAL));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_REAL));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);
  const loc = {};
  for (const name of ['aPos', 'aNormal', 'aColor', 'aEmissive', 'aSpec', 'aFog']) {
    loc[name] = gl.getAttribLocation(prog, name);
  }
  for (const name of ['uProj', 'uView', 'uSunDir', 'uSunColor', 'uAmbient', 'uCamPos', 'uFogDensity', 'uFogColor', 'uEmissive', 'uSpotPos', 'uSpotDir', 'uSpotColor', 'uSpotCos', 'uSpotCount']) {
    loc[name] = gl.getUniformLocation(prog, name);
  }

  // ---- geometry builders --------------------------------------------------
  // The builders write into `M`, the mesh under construction. The static
  // city is built into `staticMesh` once; Stage B's moving cars, people,
  // signal dots and dust are built into a fresh mesh every frame and
  // drawn from the dynamic buffer. Sharing the builders keeps both
  // passes on the same shader and the same winding rules.
  function newMesh() {
    return { pos: [], nrm: [], col: [], emi: [], spc: [], fog: [] };
  }
  const staticMesh = newMesh();
  let M = staticMesh;
  function tri(p0, p1, p2, n, c, e, s, f) {
    // Winding: (p0, p2, p1) so the geometric normal matches the declared
    // outward normal — with the opposite order every face is back-facing
    // and culled, and the frame shows only sky.
    M.pos.push(...p0, ...p2, ...p1);
    M.nrm.push(...n, ...n, ...n);
    M.col.push(...c, ...c, ...c);
    M.emi.push(...e, ...e, ...e);
    M.spc.push(s, s, s);
    M.fog.push(f, f, f);
  }
  function quad(p0, p1, p2, p3, n, c, e, s, f) {
    tri(p0, p1, p2, n, c, e, s, f);
    tri(p0, p2, p3, n, c, e, s, f);
  }
  const NOEMI = [0, 0, 0];
  function box(cx, cy, cz, w, h, d, c, opts = {}) {
    const rot = opts.rot || 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const hw = w / 2, hd = d / 2;
    const corner = (sx, sz) => [
      cx + (sx * hw * cos - sz * hd * sin),
      cy,
      cz + (sx * hw * sin + sz * hd * cos),
    ];
    const top = opts.roof || c;
    const e = opts.emissive || NOEMI;
    const s = opts.spec || 0;
    // Top and bottom.
    const t0 = corner(-1, -1), t1 = corner(1, -1), t2 = corner(1, 1), t3 = corner(-1, 1);
    const y0 = cy - h / 2, y1 = cy + h / 2;
    quad([t0[0], y1, t0[2]], [t1[0], y1, t1[2]], [t2[0], y1, t2[2]], [t3[0], y1, t3[2]], [0, 1, 0], top, e, s, 1);
    quad([t0[0], y0, t0[2]], [t3[0], y0, t3[2]], [t2[0], y0, t2[2]], [t1[0], y0, t1[2]], [0, -1, 0], c, e, s, 1);
    // Sides: east, west, south, north (normals rotated by rot).
    const nE = [cos, 0, sin], nW = [-cos, 0, -sin], nS = [-sin, 0, cos], nN = [sin, 0, -cos];
    const e0 = corner(1, -1), e1 = corner(1, 1), w0 = corner(-1, 1), w1 = corner(-1, -1);
    const s0 = corner(1, 1), s1 = corner(-1, 1), n0 = corner(-1, -1), n1 = corner(1, -1);
    quad([e0[0], y0, e0[2]], [e1[0], y0, e1[2]], [e1[0], y1, e1[2]], [e0[0], y1, e0[2]], nE, c, e, s, 1);
    quad([w0[0], y0, w0[2]], [w1[0], y0, w1[2]], [w1[0], y1, w1[2]], [w0[0], y1, w0[2]], nW, c, e, s, 1);
    quad([s0[0], y0, s0[2]], [s1[0], y0, s1[2]], [s1[0], y1, s1[2]], [s0[0], y1, s0[2]], nS, c, e, s, 1);
    quad([n0[0], y0, n0[2]], [n1[0], y0, n1[2]], [n1[0], y1, n1[2]], [n0[0], y1, n0[2]], nN, c, e, s, 1);
  }
  function prism(cx, baseY, cz, r, h, sides, c, e = NOEMI, s = 0) {
    const step = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const a0 = i * step, a1 = (i + 1) * step;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const n = [Math.cos(a0 + step / 2), 0, Math.sin(a0 + step / 2)];
      quad([x0, baseY, z0], [x1, baseY, z1], [x1, baseY + h, z1], [x0, baseY + h, z0], n, c, e, s, 1);
    }
    quad([cx - r, baseY + h, cz - r], [cx + r, baseY + h, cz - r], [cx + r, baseY + h, cz + r], [cx - r, baseY + h, cz + r], [0, 1, 0], c, e, s, 1);
  }
  function cone(cx, baseY, cz, r, h, sides, c, e = NOEMI, s = 0) {
    const step = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const a0 = i * step, a1 = (i + 1) * step;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const n = [Math.cos(a0 + step / 2) * 0.7, 0.7, Math.sin(a0 + step / 2) * 0.7];
      tri([x0, baseY, z0], [x1, baseY, z1], [cx, baseY + h, cz], n, c, e, s, 1);
    }
  }
  function hash3(x, y, z) {
    let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---- ground ---------------------------------------------------------------
  const GROUND_COLORS = {
    grass: [0.43, 0.55, 0.32],
    park: [0.38, 0.58, 0.3],
    sand: [0.87, 0.78, 0.56],
    plaza: [0.82, 0.76, 0.6],
    water: [0.1, 0.35, 0.45],
  };
  const b = city.bounds;
  const CELL = 60;
  for (let gx = b.x0; gx < b.x1; gx += CELL) {
    for (let gz = b.z0; gz < b.z1; gz += CELL) {
      const cx = gx + CELL / 2, cz = gz + CELL / 2;
      const kind = city.groundAt(cx, cz);
      const c = GROUND_COLORS[kind];
      quad([gx, 0, gz], [gx + CELL, 0, gz], [gx + CELL, 0, gz + CELL], [gx, 0, gz + CELL], [0, 1, 0], c, NOEMI, 0, 1);
    }
  }

  // ---- water ------------------------------------------------------------------
  const WATER = [0.14, 0.46, 0.56];
  for (const w of city.water) {
    quad([w.x0, 0.03, w.z0], [w.x1, 0.03, w.z0], [w.x1, 0.03, w.z1], [w.x0, 0.03, w.z1], [0, 1, 0], WATER, NOEMI, 0.85, 1);
  }
  // Canal walls and harbour quay.
  const STONE = [0.62, 0.58, 0.5];
  // Canal walls run along both banks.
  box(-72, 0.5, -264, 4, 1, 2928, STONE);
  box(72, 0.5, -264, 4, 1, 2928, STONE);
  // Harbour quay along the north edge of the basin.
  box(0, 0.4, 1200, 900, 0.8, 8, STONE);

  // ---- streets ------------------------------------------------------------------
  const ASPHALT = [0.32, 0.33, 0.35];
  const SIDEWALK = [0.78, 0.74, 0.62];
  function roadQuad(ax, az, bx, bz, w, y, c) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * (w / 2), pz = (dx / len) * (w / 2);
    quad([ax - px, y, az - pz], [bx - px, y, bz - pz], [bx + px, y, bz + pz], [ax + px, y, az + pz], [0, 1, 0], c, NOEMI, 0.02, 1);
  }
  for (const s of city.streets) {
    roadQuad(s.ax, s.az, s.bx, s.bz, s.w + 10, 0.04, SIDEWALK);
    const crossesCanal = s.az === s.bz && s.ax < -70 && s.bx > 70 && s.az > -1728 && s.az < 1200;
    if (crossesCanal) {
      // Bridge: a deck slab over the water, the road riding on it.
      roadQuad(s.ax, s.az, -95, s.bz, s.w, 0.08, ASPHALT);
      roadQuad(95, s.az, s.bx, s.bz, s.w, 0.08, ASPHALT);
      box(0, 0.08, s.az, 200, 0.16, s.w + 6, [0.5, 0.48, 0.42]);
      roadQuad(-95, s.az, 95, s.bz, s.w, 0.2, ASPHALT);
      box(-96, 0.6, s.az, 2, 0.9, s.w + 6, [0.45, 0.44, 0.4]);
      box(96, 0.6, s.az, 2, 0.9, s.w + 6, [0.45, 0.44, 0.4]);
    } else {
      roadQuad(s.ax, s.az, s.bx, s.bz, s.w, 0.08, ASPHALT);
    }
  }

  // ---- plaza, landmarks ---------------------------------------------------------
  const p = city.plaza;
  quad([p.x - p.half, 0.06, p.z - p.half], [p.x + p.half, 0.06, p.z - p.half], [p.x + p.half, 0.06, p.z + p.half], [p.x - p.half, 0.06, p.z + p.half], [0, 1, 0], [0.84, 0.78, 0.62], NOEMI, 0.05, 1);
  const tower = city.landmarks.clockTower;
  box(tower.x, tower.h / 2, tower.z, tower.w, tower.h, tower.w, [0.8, 0.74, 0.6], { roof: [0.55, 0.5, 0.44] });
  // The clock faces: pale dials with two dark hands, one on the south
  // face (seen from the plaza) and one on the north. The vertex order
  // mirrors the box() walls — the natural order winds backwards and
  // the dials are culled.
  const clockY = tower.h - 12;
  const CLOCK = [0.95, 0.93, 0.8];
  const CE = [0.9, 0.88, 0.7];
  const HAND = [0.15, 0.12, 0.1];
  const czS = tower.z + tower.w / 2 + 0.1;
  const czN = tower.z - tower.w / 2 - 0.1;
  quad([tower.x + 5, clockY, czS], [tower.x - 5, clockY, czS], [tower.x - 5, clockY + 10, czS], [tower.x + 5, clockY + 10, czS], [0, 0, 1], CLOCK, CE, 0, 1);
  quad([tower.x - 5, clockY, czN], [tower.x + 5, clockY, czN], [tower.x + 5, clockY + 10, czN], [tower.x - 5, clockY + 10, czN], [0, 0, -1], CLOCK, CE, 0, 1);
  const czH = tower.z + tower.w / 2 + 0.2;
  quad([tower.x + 0.35, clockY + 2, czH], [tower.x - 0.35, clockY + 2, czH], [tower.x - 0.35, clockY + 9, czH], [tower.x + 0.35, clockY + 9, czH], [0, 0, 1], HAND, NOEMI, 0, 1);
  quad([tower.x + 3.2, clockY + 4.7, czH], [tower.x, clockY + 4.7, czH], [tower.x, clockY + 5.3, czH], [tower.x + 3.2, clockY + 5.3, czH], [0, 0, 1], HAND, NOEMI, 0, 1);
  cone(tower.x, tower.h, tower.z, 11, 10, 4, [0.5, 0.42, 0.36]);
  const f = city.landmarks.fountain;
  prism(f.x, 0, f.z, f.r, 1.2, 8, STONE);
  prism(f.x, 1.0, f.z, f.r - 2, 0.5, 8, WATER, NOEMI, 0.85);

  // ---- buildings ------------------------------------------------------------------
  const WIN_EMI = [1.0, 0.72, 0.42];
  // Three dark window tints, picked per building, so facades do not
  // repeat one identical grid across the whole city.
  const WIN_TINTS = [[0.1, 0.12, 0.15], [0.14, 0.11, 0.09], [0.08, 0.1, 0.14]];
  function windows(b) {
    const glass = b.type === 'glass';
    const winColor = WIN_TINTS[Math.floor(hash3(Math.floor(b.x), Math.floor(b.z), 999) * 3)];
    const ww = glass ? 3.2 : 1.6;
    const wh = glass ? 4.0 : 2.2;
    const floors = Math.max(1, Math.min(6, Math.floor(b.h / 7)));
    const faces = [
      { n: [1, 0, 0], along: 'z', at: b.x + b.w / 2 + 0.12, span: b.d, fixed: b.x },
      { n: [-1, 0, 0], along: 'z', at: b.x - b.w / 2 - 0.12, span: b.d, fixed: b.x },
      { n: [0, 0, 1], along: 'x', at: b.z + b.d / 2 + 0.12, span: b.w, fixed: b.z },
      { n: [0, 0, -1], along: 'x', at: b.z - b.d / 2 - 0.12, span: b.w, fixed: b.z },
    ];
    for (let fi = 0; fi < 4; fi++) {
      const face = faces[fi];
      const cols = Math.max(1, Math.min(5, Math.floor(face.span / (glass ? 9 : 6))));
      for (let fl = 0; fl < floors; fl++) {
        const y0 = 3 + fl * ((b.h - 5) / floors);
        for (let ci = 0; ci < cols; ci++) {
          const lit = hash3(Math.floor(b.x), Math.floor(b.z), fi * 100 + fl * 10 + ci) < 0.55;
          const e = lit ? WIN_EMI : NOEMI;
          const off = -face.span / 2 + ((ci + 0.5) / cols) * face.span;
          const y1 = Math.min(y0 + wh, b.h - 1.5);
          if (face.along === 'z') {
            const z0 = b.z + off - ww / 2, z1 = b.z + off + ww / 2;
            if (face.n[0] > 0) quad([face.at, y0, z0], [face.at, y0, z1], [face.at, y1, z1], [face.at, y1, z0], face.n, winColor, e, 0, 1);
            else quad([face.at, y0, z1], [face.at, y0, z0], [face.at, y1, z0], [face.at, y1, z1], face.n, winColor, e, 0, 1);
          } else {
            const x0 = b.x + off - ww / 2, x1 = b.x + off + ww / 2;
            // The vertex order mirrors the box() walls: the south face
            // runs east-to-west, the north face west-to-east, or the
            // windows wind backwards and are culled.
            if (face.n[2] > 0) quad([x1, y0, face.at], [x0, y0, face.at], [x0, y1, face.at], [x1, y1, face.at], face.n, winColor, e, 0, 1);
            else quad([x0, y0, face.at], [x1, y0, face.at], [x1, y1, face.at], [x0, y1, face.at], face.n, winColor, e, 0, 1);
          }
        }
      }
    }
  }
  for (const bld of city.buildings) {
    const spec = bld.type === 'glass' ? 0.9 : 0.05;
    box(bld.x, bld.h / 2, bld.z, bld.w, bld.h, bld.d, bld.color, { roof: bld.roof, spec });
    windows(bld);
  }

  // ---- trees, lamps, boats, signals ----------------------------------------------
  for (const t of city.trees) {
    const green = [0.25 + t.hue * 0.12, 0.5 + t.hue * 0.15, 0.22];
    prism(t.x, 0, t.z, 0.5 * t.s, 3 * t.s, 6, [0.4, 0.3, 0.2]);
    cone(t.x, 3 * t.s, t.z, 3.4 * t.s, 6 * t.s, 6, green);
    cone(t.x, 7 * t.s, t.z, 2.3 * t.s, 5 * t.s, 6, [green[0] + 0.06, green[1] + 0.06, green[2] + 0.04]);
  }
  for (const l of city.lamps) {
    box(l.x, 3.5, l.z, 0.35, 7, 0.35, [0.16, 0.17, 0.19]);
    box(l.x, 7.1, l.z, 1.3, 0.5, 0.5, [0.2, 0.2, 0.2], { emissive: [1.0, 0.82, 0.45] });
  }
  for (const boat of city.boats) {
    box(boat.x, 0.9, boat.z, boat.len, 2.2, 7, boat.color, { rot: boat.heading });
    box(boat.x, 2.6, boat.z, boat.len * 0.45, 2.0, 5, [0.92, 0.9, 0.84], { rot: boat.heading });
  }
  for (const inter of city.intersections) {
    // The poles and head housings are static furniture; the light dots
    // are drawn dynamically every frame, so the cycle actually changes
    // colour. Corner (+14,+14) shows the north-south state, (-14,-14)
    // the east-west state.
    box(inter.x + 14, 3.5, inter.z + 14, 0.4, 7, 0.4, [0.2, 0.22, 0.24]);
    box(inter.x + 14, 7.2, inter.z + 14, 1.6, 1.0, 1.0, [0.12, 0.13, 0.14]);
    box(inter.x - 14, 3.5, inter.z - 14, 0.4, 7, 0.4, [0.2, 0.22, 0.24]);
    box(inter.x - 14, 7.2, inter.z - 14, 1.6, 1.0, 1.0, [0.12, 0.13, 0.14]);
  }
  for (const car of city.cars) {
    // A parked car: body, dark glass cabin, and a roof sign on taxis.
    // Cars with a profile are drivable: they are drawn dynamically
    // instead, so the one the player takes does not stay behind as a
    // ghost in the static buffer.
    if (car.profile) continue;
    box(car.x, 0.7, car.z, 2.0, 1.1, 4.4, car.color, { rot: car.angle, spec: 0.5 });
    box(car.x, 1.5, car.z, 1.8, 0.7, 2.4, [0.15, 0.16, 0.18], { rot: car.angle, spec: 0.6 });
    if (car.taxi) box(car.x, 2.05, car.z, 0.5, 0.35, 1.0, [0.15, 0.15, 0.15], { rot: car.angle, emissive: [0.9, 0.8, 0.2] });
  }
  // People are drawn dynamically now (they walk in Stage B); the static
  // pass keeps only the city itself, so no figure is baked in place.

  // ---- buffers ---------------------------------------------------------------------
  // Interleave the six attribute arrays vertex by vertex: position(3),
  // normal(3), colour(3), emissive(3), specular(1), fog(1). The
  // attribute pointers read them strided, so concatenating the arrays
  // instead would hand every vertex another vertex's coordinates.
  function interleaveInto(mesh, out) {
    const n = mesh.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const o = i * 14;
      out[o + 0] = mesh.pos[i * 3];
      out[o + 1] = mesh.pos[i * 3 + 1];
      out[o + 2] = mesh.pos[i * 3 + 2];
      out[o + 3] = mesh.nrm[i * 3];
      out[o + 4] = mesh.nrm[i * 3 + 1];
      out[o + 5] = mesh.nrm[i * 3 + 2];
      out[o + 6] = mesh.col[i * 3];
      out[o + 7] = mesh.col[i * 3 + 1];
      out[o + 8] = mesh.col[i * 3 + 2];
      out[o + 9] = mesh.emi[i * 3];
      out[o + 10] = mesh.emi[i * 3 + 1];
      out[o + 11] = mesh.emi[i * 3 + 2];
      out[o + 12] = mesh.spc[i];
      out[o + 13] = mesh.fog[i];
    }
    return n;
  }
  function makeBuffer(mesh) {
    const n = mesh.pos.length / 3;
    const interleaved = new Float32Array(n * 14);
    interleaveInto(mesh, interleaved);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    return buf;
  }
  const stride = 14 * 4;
  function bindAttribs(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let off = 0;
    for (const [name, size] of [['aPos', 3], ['aNormal', 3], ['aColor', 3], ['aEmissive', 3], ['aSpec', 1], ['aFog', 1]]) {
      gl.enableVertexAttribArray(loc[name]);
      gl.vertexAttribPointer(loc[name], size, gl.FLOAT, false, stride, off);
      off += size * 4;
    }
  }
  const mainBuf = makeBuffer(staticMesh);
  const mainCount = staticMesh.pos.length / 3;

  // The dynamic buffer: pre-allocated for 16384 vertices and rewritten
  // every frame from a fresh mesh (moving cars, walking people, signal
  // dots, dust). startDynamic hands the builders a fresh mesh;
  // finishDynamic uploads it and draws it with the same program.
  // 16384 leaves room above the ~10300 the Stage B scene actually
  // draws (15 traffic cars, 7 drivable cars, 25 walkers, the player
  // car, signal dots, dust); the first browser run overflowed the
  // original 8192.
  const DYN_MAX_VERTS = 16384;
  const dynBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
  gl.bufferData(gl.ARRAY_BUFFER, DYN_MAX_VERTS * 14 * 4, gl.DYNAMIC_DRAW);
  const dynInterleaved = new Float32Array(DYN_MAX_VERTS * 14);
  let dynMesh = null;
  let savedM = null;
  function startDynamic() {
    dynMesh = newMesh();
    savedM = M;
    M = dynMesh;
    return dynMesh;
  }
  function finishDynamic() {
    M = savedM;
    const n = interleaveInto(dynMesh, dynInterleaved);
    if (n > DYN_MAX_VERTS) throw new Error('dynamic mesh overflow: ' + n + ' vertices');
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynInterleaved.subarray(0, n * 14));
    bindAttribs(dynBuf);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    return n;
  }

  // Stars on a dome, the sun disc and the moon: separate small buffers.
  const starPos = [], starNrm = [], starCol = [], starEmi = [], starSpc = [], starFog = [];
  {
    let s = 12345;
    const srnd = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 420; i++) {
      const a = srnd() * Math.PI * 2;
      const e = srnd() * Math.PI * 0.48 + 0.03;
      const r = 2800;
      starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
      starNrm.push(0, 1, 0);
      starCol.push(0.9, 0.92, 1.0);
      starEmi.push(0.9, 0.92, 1.0);
      starSpc.push(0);
      starFog.push(0);
    }
  }
  const starBuf = makeBuffer({ pos: starPos, nrm: starNrm, col: starCol, emi: starEmi, spc: starSpc, fog: starFog });
  const starCount = starPos.length / 3;

  function discBuffer(dir, size, color) {
    const d = [...dir];
    const len = Math.hypot(...d);
    d[0] /= len; d[1] /= len; d[2] /= len;
    const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const rx = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
    const rl = Math.hypot(...rx) || 1;
    rx[0] /= rl; rx[1] /= rl; rx[2] /= rl;
    const ux = [d[1] * rx[2] - d[2] * rx[1], d[2] * rx[0] - d[0] * rx[2], d[0] * rx[1] - d[1] * rx[0]];
    const c = [d[0] * 2600, d[1] * 2600, d[2] * 2600];
    const p = [];
    // The disc's normal points at the sun/moon direction, so the shader
    // lights it fully; a zero normal normalises to NaN and the disc
    // renders as magenta garbage.
    const n = d;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.push(
        c[0] + rx[0] * a * size + ux[0] * b * size,
        c[1] + rx[1] * a * size + ux[1] * b * size,
        c[2] + rx[2] * a * size + ux[2] * b * size,
      );
    }
    // Wound to face the origin (the city), so the disc is front-facing
    // from the ground — the opposite order is culled and the sun/moon
    // never shows.
    const pArr = [...p.slice(0, 3), ...p.slice(6, 9), ...p.slice(3, 6), ...p.slice(0, 3), ...p.slice(9, 12), ...p.slice(6, 9)];
    const nArr = [...n, ...n, ...n, ...n, ...n, ...n];
    const cArr = [...color, ...color, ...color, ...color, ...color, ...color];
    const eArr = [...color, ...color, ...color, ...color, ...color, ...color];
    const sArr = [0, 0, 0, 0, 0, 0];
    const fArr = [0, 0, 0, 0, 0, 0];
    return makeBuffer({ pos: pArr, nrm: nArr, col: cArr, emi: eArr, spc: sArr, fog: fArr });
  }

  let presetName = 'day';
  let preset = PRESETS.day;
  let camPos = [0, 100, 500];
  let hazeOn = true;
  // Headlight spot state, filled by setSpots and uploaded in render().
  // The flat arrays are reused every frame so setting spots allocates
  // nothing.
  let spotCount = 0;
  const spotPos = new Float32Array(24);
  const spotDir = new Float32Array(24);
  const spotColor = new Float32Array(24);
  const spotCos = new Float32Array(16);
  const PRESETS_ORDER = ['day', 'sunset', 'night'];
  const sunBuf = discBuffer(PRESETS.day.sunDir, 130, [1.0, 0.9, 0.65]);
  const sunsetBuf = discBuffer(PRESETS.sunset.sunDir, 170, [1.0, 0.55, 0.25]);
  const moonBuf = discBuffer(PRESETS.night.sunDir, 90, [0.9, 0.93, 1.0]);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  function setPreset(name) {
    if (name === 'cycle') {
      const i = PRESETS_ORDER.indexOf(presetName);
      name = PRESETS_ORDER[(i + 1) % PRESETS_ORDER.length];
    }
    presetName = name;
    preset = PRESETS[name];
    gl.clearColor(preset.sky[0], preset.sky[1], preset.sky[2], 1);
  }

  let proj = mat4Perspective((60 * Math.PI) / 180, 16 / 9, 0.5, 7000);
  let view = mat4LookAt([0, 100, 500], [0, 0, 0], [0, 1, 0]);

  function resize(w, h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    proj = mat4Perspective((60 * Math.PI) / 180, w / h, 0.5, 7000);
  }

  function setCamera(eye, target) {
    view = mat4LookAt(eye, target, [0, 1, 0]);
  }

  function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    const sun = preset.sunDir;
    const sl = Math.hypot(...sun) || 1;
    gl.uniform3f(loc.uSunDir, sun[0] / sl, sun[1] / sl, sun[2] / sl);
    gl.uniform3f(loc.uSunColor, preset.sunColor[0], preset.sunColor[1], preset.sunColor[2]);
    gl.uniform1f(loc.uAmbient, preset.ambient);
    gl.uniform3f(loc.uFogColor, preset.fogColor[0], preset.fogColor[1], preset.fogColor[2]);
    gl.uniform1f(loc.uFogDensity, hazeOn ? preset.fogDensity : 0);
    gl.uniform1f(loc.uEmissive, preset.emissive);
    gl.uniform3f(loc.uCamPos, camPos[0], camPos[1], camPos[2]);
    gl.uniform1i(loc.uSpotCount, spotCount);
    if (spotCount > 0) {
      gl.uniform3fv(loc.uSpotPos, spotPos);
      gl.uniform3fv(loc.uSpotDir, spotDir);
      gl.uniform3fv(loc.uSpotColor, spotColor);
      gl.uniform2fv(loc.uSpotCos, spotCos);
    }
    bindAttribs(mainBuf);
    gl.drawArrays(gl.TRIANGLES, 0, mainCount);
    if (preset.stars) {
      bindAttribs(starBuf);
      gl.drawArrays(gl.POINTS, 0, starCount);
    }
    if (presetName === 'day') {
      bindAttribs(sunBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (presetName === 'sunset') {
      bindAttribs(sunsetBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      bindAttribs(moonBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  return {
    gl,
    setPreset,
    setHazeEnabled(on) {
      hazeOn = !!on;
    },
    preset: () => presetName,
    // Headlight spots: up to 8 world-space cones, each { pos, dir, color,
    // cosOuter, cosInner }. Set every frame before render(); the same
    // uniforms light the static city and the dynamic cars alike.
    setSpots(spots) {
      spotCount = Math.min(8, spots.length);
      for (let i = 0; i < spotCount; i++) {
        const s = spots[i];
        spotPos[i * 3] = s.pos[0];
        spotPos[i * 3 + 1] = s.pos[1];
        spotPos[i * 3 + 2] = s.pos[2];
        spotDir[i * 3] = s.dir[0];
        spotDir[i * 3 + 1] = s.dir[1];
        spotDir[i * 3 + 2] = s.dir[2];
        spotColor[i * 3] = s.color[0];
        spotColor[i * 3 + 1] = s.color[1];
        spotColor[i * 3 + 2] = s.color[2];
        spotCos[i * 2] = s.cosOuter;
        spotCos[i * 2 + 1] = s.cosInner;
      }
    },
    // Dynamic geometry: startDynamic hands the shared builders a fresh
    // mesh; finishDynamic uploads it and draws it with the same program.
    // The builders (box, quad, cone, prism, tri) are exposed for that.
    startDynamic,
    finishDynamic,
    box, quad, cone, prism, tri,
    setCamera(eye, target) {
      camPos = [...eye];
      setCamera(eye, target);
    },
    resize,
    render,
    projectPoint(p) {
      // World point to top-origin screen pixels.
      const m = new Float32Array(16);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += proj[i + k * 4] * view[k + j * 4];
          m[i + j * 4] = s;
        }
      }
      const x = p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12];
      const y = p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13];
      const w = p[0] * m[3] + p[1] * m[7] + p[2] * m[11] + m[15];
      return [
        ((x / w) * 0.5 + 0.5) * canvas.width,
        ((1 - (y / w)) * 0.5) * canvas.height,
      ];
    },
    counts: { triangles: mainCount / 3 },
  };
}
