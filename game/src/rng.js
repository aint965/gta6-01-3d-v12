// Palkon Auto — deterministic randomness (Stage A).
// A tiny seeded generator so the city is identical on every load and every
// machine. Nothing here reads the clock or the network.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stable 0..1 value for a grid cell, so two runs agree even if the walk
// order changes. Useful for per-building variation that must not depend on
// how many candidates were rejected before it.
export function cellHash(ix, iz, seed) {
  let h = (seed ^ Math.imul(ix + 100003, 374761393) ^ Math.imul(iz + 100003, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
