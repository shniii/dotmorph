<div align="center">

# dotmorph

**Dots that morph between shapes through a swirling cloud.**

An open-source WebGL effect on three.js, with a React component and a playground that exposes every parameter.

[**Live demo and playground**](https://dotmorph.shni.me) · [npm](https://www.npmjs.com/package/dotmorph) · [API reference](docs/API.md) · [Recipes](docs/RECIPES.md)

[![npm](https://img.shields.io/npm/v/dotmorph?color=ff1486&label=npm)](https://www.npmjs.com/package/dotmorph)
[![CI](https://github.com/shniii/dotmorph/actions/workflows/ci.yml/badge.svg)](https://github.com/shniii/dotmorph/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/shniii/dotmorph?color=850fff)](LICENSE)

<img src="site/public/demo.webp" alt="dotmorph cycling through a burst, a globe, a wave and a fan, the dots gathering in a swirling cloud between each shape" width="800" />

Made by [**Shnyar**](https://x.com/shinnoo22)

</div>

## Quick start

```bash
npm install dotmorph three
```

```tsx
import { DotMorph } from 'dotmorph/react';
import { PALETTES } from 'dotmorph';

<div style={{ height: 420, background: PALETTES.aurora.background }}>
  <DotMorph shape="globe" palette="aurora" />
</div>
```

Change `shape` (`burst`, `globe`, `wave` or `fan`) and every dot flies through the cloud into the next one. Not using React? The same engine is a plain class:

```ts
import { DotMorphEngine } from 'dotmorph';

const engine = new DotMorphEngine(canvas, { shape: 'burst', palette: 'ocean' });
engine.start();
engine.morphTo('wave');
```

The [package README](packages/dotmorph/README.md) lists every prop. The [API reference](docs/API.md) documents every class, method and parameter, and [Recipes](docs/RECIPES.md) covers Next.js, custom palettes, live tuning, reduced motion and fallbacks.

## Features

- **Four shapes, one engine.** A burst of rays, a turning globe, a rolling wave and a fan of curves share one renderer, and any of them can morph into any other.
- **A morph with character.** Dots leave on curved paths, a little out of step with their neighbours, gather in a slowly turning cloud, and land in the next shape. You can tune the length, the stagger and the curve.
- **Fully tunable.** Every shape parameter is typed. Live values apply on the next frame, and structural ones rebuild the geometry.
- **Six palettes** (aurora, ocean, ember, mint, rose, midnight) that fade smoothly into each other, plus any two colours of your own.
- **Interactive.** Hover a mouse or pen over the canvas: it parts the burst and the wave on springs, and stirs the globe and the fan.
- **Well-behaved.** It pauses off screen, honours `prefers-reduced-motion`, falls back cleanly without WebGL 2, and works with Next.js App Router.
- **Small surface.** It's ESM only, ships TypeScript types, and keeps `three` and `react` as peer dependencies.

## How it works

dotmorph is plain three.js: no React Three Fiber, no GPGPU and no post-processing. The shapes' motion is computed in the vertex shaders, so the CPU does almost nothing per frame. Hover adds a little CPU work, such as a few hundred small springs while you part the burst or the wave.

### Presence

Each shape is a `Group` holding one `Points` mesh for its dots and one `LineSegments` mesh for its lines. Every shape has a single number, **presence**, from 0 to 1:

- at **1** the shape is fully formed;
- at **0** every one of its dots sits in the cloud and its lines are hidden.

Every dot carries two places: its spot in the shape, computed on the GPU each frame (so shapes can sway, spin and breathe), and a slot in the cloud. The shader blends between them using presence.

### The morph

`morphTo()` slides the old shape's presence from 1 to 0 and the new shape's from 0 to 1, over `transitionDuration` seconds. The two overlap in the middle, so the cloud is never empty:

| time | old shape | new shape |
| --- | --- | --- |
| 0 to 27 % | lines draw back | |
| 0 to 60 % | dots fly into the cloud | |
| 40 to 100 % | | dots fly out to their places |
| 73 to 100 % | | lines draw in |

Each dot's own progress is shifted by a random amount (`stagger`), and it travels along a quadratic Bézier curve bent sideways (`swoop`) rather than in a straight line. The cloud spins and breathes on its own, which is what makes the in-between state feel alive.

### The four shapes

- **Burst.** Rays rise from a point just below the frame, spread on a golden-angle spiral over a tilted cap, with a dot on every tip. The tips sway on smooth noise and the whole burst breathes.
- **Globe.** A big tilted globe rising from the bottom edge, drawn only with meridian arcs. Each arc grows from a random point, then retracts, led by a dot, and the far side fades back.
- **Wave.** A fence of stems winding up a hill: the path swings left and right while it climbs away from the viewer, and a slow pulse travels up it.
- **Fan.** A bow tie of smooth strands running from a left column through a narrow waist to a right column. Each strand draws itself in and erases itself on its own rhythm.

### Colour

Dots and lines are coloured by their height on the *screen*, from the palette's `bottom` colour to its `top` colour, so the gradient stays fixed to the viewport while the shapes move through it. Each built-in palette comes with a matching CSS background: a glow of several colours arching up from the bottom edge. For your own palettes, `paletteBackground()` builds one from the two ramp colours. Changing palettes fades the colours over 0.7 s.

## Repository

| path | what |
| --- | --- |
| [`packages/dotmorph`](packages/dotmorph) | the library published to npm (`dotmorph`, `dotmorph/react`) |
| [`site`](site) | the landing page and playground at [dotmorph.shni.me](https://dotmorph.shni.me) |
| [`docs`](docs) | API reference and recipes |

```bash
npm install
npm run dev        # site on localhost, with the library aliased to its sources
npm run typecheck
npm run build      # library (ESM + types), then the site
```

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Credits

Made by **Shnyar**: [X @shinnoo22](https://x.com/shinnoo22) · [GitHub @shniii](https://github.com/shniii).

Built with [three.js](https://threejs.org). The playground uses [DialKit](https://github.com/joshpuckett/dialkit).

## License

[MIT](LICENSE) © 2026 Shnyar
