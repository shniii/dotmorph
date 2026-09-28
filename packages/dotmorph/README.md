<div align="center">

# dotmorph

**Dots that morph between shapes through a swirling cloud.**

WebGL on three.js, with a React component. Made by [Shnyar](https://x.com/shnulli) · [GitHub @shniii](https://github.com/shniii).

[Live demo and playground](https://dotmorph.shni.me) · [GitHub](https://github.com/shniii/dotmorph) · [API reference](https://github.com/shniii/dotmorph/blob/main/docs/API.md) · [Recipes](https://github.com/shniii/dotmorph/blob/main/docs/RECIPES.md)

[![npm](https://img.shields.io/npm/v/dotmorph?color=22c486&label=npm)](https://www.npmjs.com/package/dotmorph)
[![license](https://img.shields.io/npm/l/dotmorph?color=6d3cf2)](https://github.com/shniii/dotmorph/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/dotmorph?color=2d8cf0)](https://www.npmjs.com/package/dotmorph)

<img src="https://dotmorph.shni.me/demo.webp" alt="dotmorph cycling through a burst, a globe, a wave and a fan, the dots gathering in a swirling cloud between each shape" width="800" />

</div>

## Install

```bash
npm install dotmorph three
```

dotmorph is ESM only. `three` is a peer dependency (0.163 or newer). `react` is an optional peer, needed only for `dotmorph/react`. With TypeScript, also add the three.js types:

```bash
npm install -D @types/three
```

## React

```tsx
import { DotMorph } from 'dotmorph/react';
import { PALETTES } from 'dotmorph';

export function Hero({ shape }: { shape: 'burst' | 'globe' | 'wave' | 'fan' }) {
  return (
    <div style={{ height: 420, background: PALETTES.aurora.background }}>
      <DotMorph shape={shape} palette="aurora" />
    </div>
  );
}
```

The canvas is transparent and fills its parent. Change `shape` and every dot flies into a slowly turning cloud, then out into the new shape. It works in Next.js App Router out of the box, because the entry ships with `'use client'`.

| prop | type | default | |
| --- | --- | --- | --- |
| `shape` | `'burst' \| 'globe' \| 'wave' \| 'fan' \| number` | `'burst'` | Shape to show. Changing it morphs. |
| `palette` | `PaletteName \| Palette` | `'aurora'` | `aurora`, `ocean`, `ember`, `mint`, `rose`, `midnight`, or your own `{ top, bottom }`. |
| `motion` | `boolean` | follows `prefers-reduced-motion` | When `false`, time stands still and morphs are instant. |
| `transitionDuration` | `number` | `1.5` | Seconds per morph. |
| `interactive` | `boolean` | `true` | React to a hovering mouse or pen: the burst and the wave part around it, the globe and the fan swirl. |
| `pauseWhenHidden` | `boolean` | `true` | Stop rendering while scrolled out of view. |
| `options` | `EngineOptions` | | Cloud layout, per-shape parameters, stagger, swoop and more. Read once, on mount. |
| `onReady` | `(engine) => void` | | Access the engine, e.g. to tune it live. |
| `onMorphEnd` | `(shape) => void` | | Fires when a morph finishes. |
| `onError` / `fallback` | | | Called, and rendered instead of the canvas, when WebGL 2 is unavailable. |

## Vanilla JavaScript

```ts
import { DotMorphEngine } from 'dotmorph';

const engine = new DotMorphEngine(canvas, { shape: 'burst', palette: 'ocean' });
engine.start();

button.onclick = () => engine.morphTo('wave');
```

Call `engine.resize()` when the canvas changes size, and `engine.dispose()` when you're done.

## Make it yours

```ts
// Your own colours: a vertical ramp from bottom to top.
engine.setPalette({ top: '#7cf5c4', bottom: '#1d4ed8' });

// The feel of the morph.
engine.setSettings({ transitionDuration: 2, stagger: 0.5, swoop: 0.8 });

// Every shape is tunable while it runs.
engine.shapes.globe.setParams({ arcs: 320, spin: 0.08 });
engine.shapes.burst.setParams({ rays: 900, spread: 70 });
```

Every parameter is listed in the [API reference](https://github.com/shniii/dotmorph/blob/main/docs/API.md), and you can drag them all in the [playground](https://dotmorph.shni.me).

## How it works

Each dot knows two places: its spot in the current shape, computed on the GPU every frame, and a slot in a small cloud in the middle of the scene. A morph slides the old shape's presence from 1 to 0 and the new shape's from 0 to 1, with the two overlapping in the middle. Every dot follows its own curved path and leaves a little earlier or later than its neighbours, so the swarm moves like one soft body. Lines draw back before their dots leave and draw in after the new dots land.

## Browser support

Any browser with WebGL 2: current Chrome, Edge, Firefox and Safari 15+. three.js r184 and newer need Safari 16.4+, Chrome 94+ and Firefox 93+. Use `fallback` for the rest.

## License

[MIT](https://github.com/shniii/dotmorph/blob/main/LICENSE) © 2026 Shnyar
