# Stage A build report — Palkon Auto (gta6-01-3d-v12)

## What was built

- **Handwritten WebGL 2 renderer** (`game/src/renderer.js`): one shader
  program, one merged static vertex buffer for the whole city, separate
  buffers for stars, sun disc and moon. Directional sun/moon + ambient,
  per-vertex emissive (lit windows, lamp heads), specular for glass and
  water, exponential fog. No vendored engine.
- **Solmar, laid out like a real city** (`game/src/city.js`, seed 20261123,
  ~3,840 x 3,456): one wide boulevard (Solmar Avenue, x=400) through the
  centre, secondary streets, narrow local streets at visibly different
  widths; varied block sizes; Old Solmar off-grid (drifted streets plus a
  diagonal avenue); central plaza with a clock tower (working dial + hands)
  and fountain where the boulevard meets the main cross street; canal with
  3 bridges, harbour, beach, park, canal promenade with lamps and trees.
- **One palette per district**, so each quarter reads from a block away:
  Old Solmar ochre/terracotta, Canal Ward brick red, South Market sand and
  coral, Citrus Quarter leaf green and citrus yellow, Pearl Marina white
  and pale blue, Glasspoint blue glass, Sunstrand Beach sand and pastel
  pink. Window tints vary per building (3 dark tints), so facades do not
  repeat one identical grid.
- **Street life, cheap but readable**: 23 parked cars including 3 bright
  yellow taxis on the boulevard, 25 people on foot in bright jackets on
  sidewalks, the plaza edge and the promenade, 244 street lamps (lit at
  night), traffic lights at every intersection (red on one corner, green
  on the opposite), trees, boats in the harbour. Cars and people are
  static in Stage A; Stage B makes them move.
- **3 lighting presets** (keys 1/2/3 or T): scorching midday sun, sunset
  (low orange sun in the west), night (moon, stars, street lights). Fog is
  thin enough that the far skyline keeps its district colours and window
  variation instead of washing out to one flat haze.
- **Opening vista**: the game opens high over the boulevard south of the
  plaza, looking north up Solmar Avenue at the clock tower and the skyline
  — the city itself on the first frame.
- **Permanent HUD**: title + district + light preset + FPS, a compass
  strip that follows the camera yaw, a big speedometer (0 km/h on foot in
  Stage A; becomes the driving speed in Stage B), a canvas minimap with
  buildings coloured by district, and the control scheme written along
  the bottom (`Drag to look around · Scroll to zoom · 1 / 2 / 3 midday /
  sunset / night · T cycle light`).

## Verification (all done in this session)

- **Layout verifier: 0 problems.** 678 buildings, 241 trees, 244 lamps,
  23 cars (3 taxis), 25 pedestrians, 5 boats, 24 intersections.
- **Headless runs: 0 console errors, 0 page errors, 0 failed requests**
  across 5 runs (4 staged shots + the opening vista), each via a CDP
  driver that waits for `__palkon.ready` and captures the composited page
  (WebGL canvas + DOM HUD and minimap).
- **Screenshots viewed in-session** (all 1280x720, each under the 256 KiB
  cap): `1-boulevard-day.jpg` (78,265 B), `2-sunset.jpg` (59,818 B),
  `3-night.jpg` (70,961 B), `4-plaza.jpg` (72,286 B). The minimap in each
  shows the boulevard, the off-grid old quarter and the plaza. An extra
  opening-vista shot (`/tmp/palkon-v12/0-opening-vista.jpg`) is kept
  outside the repo as evidence.
- **Packaging twice byte-identical**: `MAKEFUN_OUTPUT_DIR=out node
  main.ts` run twice; `dossier.json` sha256
  `24e000ee9271895f5da72501363bd4f549390040c5bfd8783c7127d11ae247ff` both
  times, full `diff -r` clean. `game/` is 63,493 B in 10 files.

## Bugs found and fixed in this session

- Reversed triangle winding made every face back-facing (frame showed
  only sky); fixed in `tri()` and the sun/moon disc buffers.
- The vertex buffer concatenated the attribute arrays instead of
  interleaving them (garbage geometry, 90 s+ per frame in SwiftShader);
  fixed in `makeBuffer()`.
- Zero normals on the sun/moon discs normalised to NaN (magenta);
  discs now face the sun/moon direction.
- North/south window quads and both clock-face dials wound backwards
  and were culled; fixed to mirror the box() walls.
- The layout verifier checks the bounding circle, not the rectangle
  edge, so a rectangle-edge placement test still let square buildings
  overlap streets; placement now uses the verifier's own rule.
- HUD preset label never updated on a one-frame render (only after
  250 ms); the HUD now updates on the first frame.
- Two boulevard cars parked in the harbour water; the boulevard car and
  pedestrian ranges now stop at the harbour.

## Notes for later stages (from the user's design direction — NOT done here)

1. **Mission objective always in 3 forms at once**: dialog + HUD panel +
   world marker. (Stage C/D brief.)
2. **Mission timer must not run before the player moves.** (Stage C/D
   brief.)
3. Traffic lights cycle, cars drive, people walk. (Stage B.)
4. Speedometer wires to the driving speed. (Stage B.)

---

# Stage B build report — Palkon Auto (gta6-01-3d-v12)

## What was built

- **Four driving profiles** (`game/src/vehicle.js`): compact 115, sedan
  130, van 108, coupe 158 km/h, each with its own acceleration, braking
  and steering feel. All four reach their rated top speed.
- **Traffic** (`game/src/traffic.js`): 5 loops, 15 cars, 24 intersections
  on a 26 s light cycle (NS green 0–11, yellow 11–13, red 13–26; EW red
  0–13, green 13–24, yellow 24–26). Cars brake to a stop line 12 units
  before the intersection centre, hold a following gap, and stop for the
  player's car ahead of them. A car that cannot stop on yellow clears the
  junction only if it reaches the line before the yellow ends.
- **Headlights** (`game/src/main.js` `headlightSpots`, `game/src/renderer.js`
  spot uniforms): 4 world-space cones — 2 headlights x (wide near cone
  28/18 degrees + narrow far cone 16/10 degrees), slight outward splay
  and downward tilt. Per-fragment lighting (the shader interpolates world
  position + normal) so the pool shows mid-road-quad, not just at vertices.
- **Collision feedback** (`game/src/collision.js`): SAT rotated-rect vs
  axis-aligned rects over a 120-unit spatial grid (~700 static obstacles);
  impacts shake the camera and spawn dust/sparks, and speed keeps only
  its along-wall component.
- **Drivable cars**: 7 (3 yellow taxi sedans + compact + van + coupe).
  A drivable car shows its driver door swung open and an "E — Drive the
  ..." prompt within 4.5 units; E gets in, E gets out (exits on the
  driver's side). Parked cars are visibly distinct (no open door, no
  prompt).
- **Walking people**: 25 pedestrians now walk (11 boulevard sidewalks,
  8 plaza perimeter, 6 canal promenade) and pause 0.4 s when a car is
  directly ahead of them.
- **HUD speedometer wired to real driving speed**; the DBG debug overlay
  line ("DBG eye=...") is removed.
- **Dynamic geometry** (`game/src/renderer.js`): static city drawn once,
  moving objects rebuilt into a fresh mesh every frame from a pre-allocated
  dynamic buffer (DYNAMIC_DRAW + bufferSubData).

## Verification (all done in this session)

- **Node tests: ALL PASS** (`/tmp/palkon-v12/test-stage-b.mjs`, since lost
  in a VM restart — see note below). Top speeds: compact 114.7/115,
  sedan 129.7/130, van 107.7/108, coupe 157.6/158 km/h, 0 collisions.
  Drive test: stop-at-red gap 1.0 (bumper to line, light red), reverse
  15.1 units in 2.5 s. Traffic over 90 s: 12 red-light stops (gaps
  0.0–1.0), **0 red-runs**, 0 yellow-passes, min follow gap 499.9.
- **Browser headlight test: PASS, both haze variants**
  (`?test=headlight` and `?test=headlight&haze=off`, CDP driver, 0
  console/page errors). Haze ON: asphalt +204.6 mean rise (100% of pixels
  >+10), sedan roof +178.9 (100%), unlit control 0.0. Haze OFF: asphalt
  +203.7 (100%), roof +180.4 (100%), unlit 0.0. The night screenshot
  shows the beam pooling on the road ahead and lighting the car in front.
- **Browser plain load: 0 console errors, 0 page errors, 0 failed
  requests** (CDP driver, composited opening-vista screenshot viewed).
  The "GPU stall due to ReadPixels" lines are SwiftShader performance
  notes, not errors.
- **Screenshots viewed in-session** (all 1280x720): the night headlight
  shot (beam on the road + the sedan ahead) and the daytime boulevard
  opening. The headlight screenshots were lost with /tmp (see note).

## Bugs found and fixed in this session

- **Dynamic mesh overflow**: the first browser run threw "dynamic mesh
  overflow: 10332 vertices" — the 8192-vertex dynamic buffer was too
  small for 15 traffic cars + 7 drivable cars + 25 walkers + signals +
  dust. Raised to 16384 (`renderer.js` `DYN_MAX_VERTS`).
- **Headlight shader direction reversed**: the spot loop dotted the
  surface-to-light vector with the spot direction (about -1), so the cone
  was always zero and the headlights lit nothing; the bright pool in the
  first screenshot was the moon's specular reflection, not the beam.
  Fixed to use the light-to-surface vector (`toSurf = vWorld - uSpotPos`).
- **Headlight test sampled the wrong pixels**: `projectPoint` ran before
  `renderer.setCamera`, so it used the previous frame's view matrix.
  `setCamera` is now called right after `camera.place`, before projecting
  the sample points. The sample canvas also got `willReadFrequently: true`.
- **Traffic ran red lights (12, then 5)**: three separate causes. (1)
  Corner intersections were recorded twice (once per leg, opposite axes),
  so the test counted legal crossings as red-runs; each intersection is
  now recorded once, for the leg that ends there. (2) A car braking harder
  than its profile stopped early, then crept forward on the profile and
  nudged its bumper across the line; close to the line a car now never
  speeds up toward a red light and, once halted near the line, holds
  still. (3) The profile aimed at the line itself, so one discrete step
  pushed the bumper 0.00 past it; cars now aim to halt 1 unit before the
  line. The unlit control point was also moved from x=364 to x=330: the
  wide near cone reaches about x=366 at that range, so the old point sat
  in the penumbra.
- **Drive-test stop overshot by a hair** (gap -0.0): the auto-driver now
  aims 1 unit early, like a real driver leaving a margin; the measured
  gap is to the real line (1.0).

## NOT finished in this session — blocked by a VM restart

- Around the time the driving screenshot was being taken, the VM
  restarted (or /tmp was wiped): /tmp is empty, the dev server on port
  8124 is dead, and the **recorder (pid 27097, recording 01a206b3) is
  dead**. The Stage B code is intact in the working tree (uncommitted)
  and all the numbers above were measured before the restart, but:
  - The **in-browser E-enter + daytime drive screenshot was not
    completed**. The drive-driver (CDP key events) works — a Digit3
    press provably changed the preset to Night — but Mara spawns 40 units
    from the nearest taxi and the walk drifts slightly west, so she stops
    just outside the 4.5-unit E radius; the driver was being made adaptive
    (sidestep east while polling #prompt) when /tmp vanished. Driving
    physics itself is verified by the Node drive test, not yet by an
    in-browser drive.
  - **Packaging (twice byte-identical) was not run** for Stage B.
  - The **recorder cannot be resumed**; it can only be sealed as-is.
    The parent must decide how to handle the interrupted recording
    before Stage C.
- The /tmp drivers and test scripts (`driver.mjs`, `test-driver.mjs`,
  `test-stage-b.mjs`, `drive-driver.mjs`, `key-test.mjs`,
  `debug-traffic.mjs`, `debug-readback.mjs`) and all Stage B screenshots
  were lost with /tmp and need recreating from the session notes above.

