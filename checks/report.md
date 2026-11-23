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
