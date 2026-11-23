// Palkon Auto — the three lighting presets (Stage A).
// Day is a scorching midday sun, sunset a low orange sun in the west,
// night a moon, stars and street lights. Each preset carries the sun/moon
// direction, the light colours, the sky and fog colours, and how strongly
// emissive surfaces (lit windows, lamp heads, the moon) glow.

export const PRESET_ORDER = ['day', 'sunset', 'night'];

export const PRESETS = {
  day: {
    label: 'Midday',
    sunDir: [0.45, 0.85, 0.28],
    sunColor: [1.0, 0.96, 0.86],
    ambient: 0.58,
    sky: [0.58, 0.76, 0.9],
    fogColor: [0.72, 0.8, 0.87],
    // Thin enough that the far skyline keeps its district colours and
    // window variation instead of washing out to one flat haze.
    fogDensity: 0.0002,
    emissive: 0.06,
    stars: false,
    sunDisc: true,
  },
  sunset: {
    label: 'Sunset',
    sunDir: [-0.88, 0.16, 0.3],
    sunColor: [1.0, 0.52, 0.26],
    ambient: 0.34,
    sky: [0.88, 0.48, 0.38],
    fogColor: [0.86, 0.58, 0.46],
    fogDensity: 0.00024,
    emissive: 0.4,
    stars: false,
    sunDisc: true,
  },
  night: {
    label: 'Night',
    sunDir: [-0.3, 0.82, -0.42],
    sunColor: [0.42, 0.55, 0.8],
    ambient: 0.15,
    sky: [0.025, 0.045, 0.1],
    fogColor: [0.035, 0.055, 0.1],
    fogDensity: 0.00032,
    emissive: 1.0,
    stars: true,
    sunDisc: false,
  },
};
