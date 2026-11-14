# Development

## Running it locally

You need Node 22.12 or newer.

```sh
npm install
npm run dev
```

Video export uses WebCodecs, so try it in a recent Chrome, Edge, Safari or Firefox.

Before committing, run `npm run check`. It typechecks, lints with Biome and runs the tests with Vitest. `npm run format` fixes formatting and import order, and `npm run build` puts the static site in `dist/`.

## Where things are

```
src/
  engine/       scene generation: seeded RNG, noise, palettes, moods, composition
    primitives/ building blocks shared by themes: sky, ridges, forests, clouds, dunes, lakes, birds...
  themes/       one file per theme
  render/       canvas, WebGL, SVG and video output, plus the render workers
  app/          the React UI
```

The engine never touches the DOM, so a scene renders the same in the main thread, in a worker, on canvas, in WebGL and as SVG.

## How it works

A theme takes a seeded RNG and returns a scene: a palette and a stack of layers, each a flat silhouette at some depth between 0 (nearest) and 1 (the horizon). Coordinates are relative to the canvas height, so any resolution gives the same picture. Shapes are SVG path strings, which Canvas reads with `Path2D` and SVG uses as is.

Most of the look comes from the engine rather than the themes:

- Layer colors come from depth. Near layers sit close to the palette's darkest color and far ones fade into the haze color, which is where the sense of distance comes from.
- A palette is seven OKLCH colors (sky top, sky horizon, sun, haze, ink, light, accent) taken from a mood preset and nudged by the seed. Themes don't pick raw colors.
- One sun or moon per scene. It decides which ridge edges catch rim light and where the glow and light shafts go.
- Glow and fog are gradients rather than blurs, so they survive SVG export.
- Colors are slightly muted, edges get a small seamless wobble and a paper texture goes on top, so it reads as drawn rather than vector-perfect.
- Each layout is scored (is the sun visible, is there a clear skyline, can every layer be told apart) and regenerated up to six times, keeping the best one.

Every random decision goes through a named fork of the RNG (`rng.fork('clouds')`), so the streams are independent. Nothing in `engine/` or `themes/` reads `Math.random` or the clock.

Animation is a function of `t` from 0 to 1, and frame 0 and frame 1 are identical, so everything loops. Clouds drift a whole number of frame widths per loop, fog sways, stars twinkle and birds cycle through wing poses. Terrain is periodic horizontally, so the panning camera can scroll forever. Each layer drifts a whole number of widths per loop depending on its depth, which keeps the parallax seamless. The day cycle blends between moods as the sun and moon move. Playback crossfades between keyframes rendered in workers, with low-resolution previews loaded in the background so scrubbing stays smooth.

Stills are drawn with Canvas 2D in a worker, playback uses WebGL, and video is encoded in the browser with WebCodecs.

## Adding a theme

Create `src/themes/<id>.ts` with a default export from `defineTheme`. It's picked up automatically. `alpine.ts` is the best one to copy from.

A few rules keep seeds stable and loops seamless:

- Fork the RNG by name for every independent decision. That way adding something later doesn't reshuffle everything else.
- Keep terrain periodic horizontally (`loopNoise1D`, `wrap: true`), or the panning camera will show a seam.
- Declare parameters with `param.range`, `param.int` and `param.chance` so they show up in the panel.

## Theme versions

A scene is identified by its theme, version and seed. Until a theme is released it can change freely. After that, anything that changes existing pictures needs a new version, and the old one should stay in the code so shared links still open the same landscape.

`src/themes/themes.test.ts` keeps this honest by comparing fingerprints of a fixed set of scenes against a snapshot. If it fails, your change altered existing seeds. Before release, check the change and update the snapshot with `npx vitest run -u`. After release, ship it as a new version instead.

## Deployment

Cloudflare Pages builds the site from this repo. Pushes to `main` go to production and pull requests get a preview link. The build command is `npm run check && npx vite build` with `dist` as the output folder and `NODE_VERSION` set to match `.nvmrc`, so a failing check stops the deploy. `public/_headers` caches the hashed files in `/assets/` for a year.
