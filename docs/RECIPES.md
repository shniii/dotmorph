# dotmorph recipes

Short, copy-paste examples for common jobs. They are written in TypeScript. Drop the types for plain JavaScript. In the short snippets, `engine` is your `DotMorphEngine`: the one `onReady` hands you, or one you created yourself. For every option and method, see the [API reference](API.md). For the overview, see the [README](../README.md).

- [Next.js App Router hero](#nextjs-app-router-hero)
- [Cycle shapes on a timer](#cycle-shapes-on-a-timer)
- [Buttons or tabs that morph](#buttons-or-tabs-that-morph)
- [Your own palette](#your-own-palette)
- [Match a dark site](#match-a-dark-site)
- [Tune a shape live](#tune-a-shape-live)
- [A slower, softer morph](#a-slower-softer-morph)
- [A bigger or smaller cloud](#a-bigger-or-smaller-cloud)
- [Reduced motion and a static fallback](#reduced-motion-and-a-static-fallback)
- [Vanilla JavaScript with resize and cleanup](#vanilla-javascript-with-resize-and-cleanup)
- [Performance](#performance)

## Next.js App Router hero

`dotmorph/react` ships with `'use client'`, so a Server Component can render `<DotMorph>` directly:

```tsx
// app/page.tsx (a Server Component)
import { PALETTES } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

export default function Home() {
  return (
    <section style={{ position: 'relative', height: '80vh', background: PALETTES.aurora.background }}>
      <DotMorph shape="globe" palette="aurora" style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'relative', padding: '18vh 24px 0', textAlign: 'center', pointerEvents: 'none' }}>
        <h1>Your headline</h1>
        <a href="/start" style={{ pointerEvents: 'auto' }}>
          Get started
        </a>
      </div>
    </section>
  );
}
```

- You don't need `next/dynamic` or `ssr: false`. The server renders an empty canvas, and the engine is created in the browser.
- The canvas fills the section, and the text sits on top with `pointer-events: none`, so the pointer still reaches the canvas. Links and buttons get `pointer-events: auto` back.
- A Server Component can only pass serializable props. For callbacks (`onReady`, `onMorphEnd`, `onError`) or state, write a small client component and render that from the page:

```tsx
// app/hero-canvas.tsx
'use client';

import { DotMorph } from 'dotmorph/react';

export function HeroCanvas() {
  return (
    <DotMorph
      shape="globe"
      palette="aurora"
      style={{ position: 'absolute', inset: 0 }}
      onError={(error) => console.warn('dotmorph could not start', error)}
    />
  );
}
```

## Cycle shapes on a timer

```tsx
'use client';

import { useEffect, useState } from 'react';
import { SHAPE_NAMES, type ShapeName } from 'dotmorph';
import { DotMorph, usePrefersReducedMotion } from 'dotmorph/react';

const nextShape = (shape: ShapeName) => SHAPE_NAMES[(SHAPE_NAMES.indexOf(shape) + 1) % SHAPE_NAMES.length];

export function CyclingHero({ every = 5000 }: { every?: number }) {
  const [shape, setShape] = useState<ShapeName>('burst');
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return; // no automatic changes for visitors who asked for less motion
    const id = window.setInterval(() => setShape(nextShape), every);
    return () => window.clearInterval(id);
  }, [every, reducedMotion]);

  return (
    <div style={{ height: 460 }}>
      <DotMorph shape={shape} />
    </div>
  );
}
```

- Each shape holds for `every` minus the morph length (1.5 s by default).
- While the hero is off screen, shape changes are instant. Visitors who scroll back see a finished shape, not half a morph.

## Buttons or tabs that morph

```tsx
'use client';

import { useState } from 'react';
import { SHAPE_NAMES, type ShapeName } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

const LABELS: Record<ShapeName, string> = { burst: 'Burst', globe: 'Globe', wave: 'Wave', fan: 'Fan' };

export function ShapePicker() {
  const [shape, setShape] = useState<ShapeName>('globe');
  const [landed, setLanded] = useState<ShapeName>('globe');

  return (
    <div>
      <div style={{ height: 420 }}>
        <DotMorph shape={shape} onMorphEnd={setLanded} />
      </div>
      <div role="group" aria-label="Shape">
        {SHAPE_NAMES.map((name) => (
          <button key={name} type="button" aria-pressed={shape === name} onClick={() => setShape(name)}>
            {LABELS[name]}
          </button>
        ))}
      </div>
      <p aria-live="polite">Showing: {LABELS[landed]}</p>
    </div>
  );
}
```

- Clicking during a morph turns the dots towards the new shape from wherever they are. Nothing jumps.
- `onMorphEnd` fires when the dots have landed, or straight away when motion is off.

Without React, call `morphTo` from your buttons:

```ts
import type { ShapeName } from 'dotmorph';

// <button data-shape="wave">Wave</button>
document.querySelectorAll<HTMLButtonElement>('button[data-shape]').forEach((button) => {
  button.addEventListener('click', () => engine.morphTo(button.dataset.shape as ShapeName));
});
```

`morphTo` throws a `RangeError` for a name that isn't a shape.

## Your own palette

A palette is two colours, `top` and `bottom`. `paletteBackground()` builds a matching CSS background from the same two colours:

```tsx
import { paletteBackground, type Palette } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

const top = '#7cf5c4';
const bottom = '#1d4ed8';

export const brand: Palette = {
  top,
  bottom,
  rampEnd: 0.75, // the ramp reaches `top` at 75 % of the canvas height
  background: paletteBackground(top, bottom),
};

export function BrandHero() {
  return (
    <div style={{ height: 480, background: brand.background }}>
      <DotMorph palette={brand} />
    </div>
  );
}
```

For a stylesheet, print the background once and paste it:

```ts
import { paletteBackground } from 'dotmorph';

console.log(paletteBackground('#7cf5c4', '#1d4ed8'));
// radial-gradient(140% 110% at 50% 115%, #3e88d1 0%, #96f7d0 20%, #cbfbe7 40%, #edfef7 58%, #fafffd 78%)
```

- `paletteBackground()` accepts only `#rgb` and `#rrggbb`. The palette colours themselves can be any colour string three.js reads.
- An inline palette object is fine. The component only fades when `top`, `bottom` or `rampEnd` change.
- Changing `palette` fades the dots over 0.7 s. The background is yours to change.

## Match a dark site

The built-in `midnight` palette is made for dark pages:

```tsx
import { PALETTES } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

export function DarkHero() {
  return (
    <div style={{ height: 480, background: PALETTES.midnight.background }}>
      <DotMorph palette="midnight" />
    </div>
  );
}
```

For your own dark palette, pass `true` as the third argument of `paletteBackground()`. The glow then fades into a deep night instead of pale paper:

```ts
import { paletteBackground, type Palette } from 'dotmorph';

const top = '#ffd6a5';
const bottom = '#ff4d6d';

export const dusk: Palette = {
  top,
  bottom,
  rampEnd: 0.9,
  dark: true,
  background: paletteBackground(top, bottom, true),
};
```

The canvas is transparent, so you can also keep your site's own background (for example `background: '#0b0d17'`) and skip the generated one. Choose a light `top` colour so the upper dots stay visible, as `midnight` does. To follow the visitor's colour scheme, switch the prop, for example `palette={dark ? 'midnight' : 'aurora'}`, and switch the container's background to match.

## Tune a shape live

For starting values, use `options.shapes`. They are read once, on mount, and built once:

```tsx
import { DotMorph } from 'dotmorph/react';

export function DenseGlobe() {
  return (
    <div style={{ height: 460 }}>
      <DotMorph shape="globe" options={{ shapes: { globe: { arcs: 320, spin: 0.08 }, burst: { rays: 600 } } }} />
    </div>
  );
}
```

To change things while it runs, keep the engine from `onReady` and call `setParams`:

```tsx
'use client';

import { useState } from 'react';
import { GLOBE_DEFAULTS, type DotMorphEngine, type GlobeParams } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

export function TunableGlobe() {
  const [engine, setEngine] = useState<DotMorphEngine | null>(null);

  const tune = (patch: Partial<GlobeParams>) => {
    if (!engine) return;
    engine.shapes.globe.setParams(patch); // draws a frame by itself when the loop is stopped
  };

  return (
    <>
      <div style={{ height: 420 }}>
        <DotMorph shape="globe" onReady={setEngine} />
      </div>
      <label>
        Spin
        <input
          type="range"
          min={0}
          max={0.3}
          step={0.01}
          defaultValue={GLOBE_DEFAULTS.spin}
          onChange={(event) => tune({ spin: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label>
        Arcs
        <input
          type="range"
          min={40}
          max={600}
          step={10}
          defaultValue={GLOBE_DEFAULTS.arcs}
          onChange={(event) => tune({ arcs: event.currentTarget.valueAsNumber })}
        />
      </label>
    </>
  );
}
```

- `spin` is live: it applies on the next frame. `arcs` is structural: it rebuilds the globe. That is fine from a slider. The [API reference](API.md#shapes) marks every param.
- `onReady` is also a good place for one-off changes to engine settings, for example `engine.setSettings({ dotSize: 6.5 })`.
- Don't set `shape`, `palette`, `motion`, `interactive` or `transitionDuration` through the engine: the component applies its props again and overwrites them. Use the props.

## A slower, softer morph

```tsx
import type { ShapeName } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

export function SoftHero({ shape }: { shape: ShapeName }) {
  return (
    <div style={{ height: 460 }}>
      <DotMorph
        shape={shape}
        transitionDuration={2.6}
        options={{ stagger: 0.6, swoop: 0.25, lineStart: 0.7, cloudSpin: 0.2 }}
      />
    </div>
  );
}
```

- `transitionDuration`: the length of the whole morph, in seconds.
- `stagger`: 0.6 spreads the departures and arrivals over more of the morph. Each dot's own flight gets shorter. The value is capped at 0.9.
- `swoop`: 0.25 gives straighter, calmer paths. Raise it (0.8 or more) for wide, sweeping arcs.
- `lineStart`: 0.7 keeps lines hidden until the dots have nearly landed, and makes them vanish sooner when a shape leaves.
- `cloudSpin`: a slower turning cloud.

`options` is read once. To change the feel later, call `setSettings` on the engine:

```ts
engine.setSettings({ stagger: 0.6, swoop: 0.25 }); // applies from the next frame
engine.setSettings({ transitionDuration: 2.6 }); // applies from the next morph
```

With `DotMorph`, change `transitionDuration` through its prop, not `setSettings`. For a snappier feel, try `transitionDuration={0.9}` with `stagger: 0.15`.

## A bigger or smaller cloud

The cloud is where the dots gather during a morph. Its size and shape are `CloudSettings`. Its position and look are engine settings.

```tsx
import { DotMorph } from 'dotmorph/react';

export function WideCloudHero() {
  return (
    <div style={{ height: 460 }}>
      <DotMorph
        options={{
          cloud: { radius: 1.8, flatten: 0.5 }, // wider and flatter
          cloudCenter: { x: 0, y: 0.6, z: 0 }, // a little higher
          cloudDotScale: 0.5, // smaller dots while in the cloud
          cloudOpacity: 0.7,
        }}
      />
    </div>
  );
}
```

To change it while it runs:

```ts
engine.setCloud({ radius: 0.8 }); // smaller, tighter cloud; rebuilds all four shapes
engine.setSettings({ cloudCenter: { x: 2, y: 0.3, z: 0 } }); // move it to the right; no rebuild
```

- `radius` is the size along `x` in world units. `flatten` scales `y` and `z` (below 1 gives a flatter cloud). `seed` reshuffles the slots.
- `setCloud` rebuilds geometry, so don't call it every frame. Moving the cloud with `cloudCenter` is cheap.
- The cloud only shows during a morph.

## Reduced motion and a static fallback

**Reduced motion is handled by default.** When the visitor's system asks for less motion, `DotMorph` draws a still frame: nothing moves, and shape and palette changes are instant. You don't need to do anything.

**Fallback image.** Without WebGL 2, the engine can't start. Pass a `fallback` to show an image instead, and `onError` to hear about it:

```tsx
'use client';

import { DotMorph } from 'dotmorph/react';

const still = (
  <img src="/hero-still.png" alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
);

export function Hero() {
  return (
    <div style={{ height: 480 }}>
      <DotMorph shape="globe" fallback={still} onError={(error) => console.warn('dotmorph could not start', error)} />
    </div>
  );
}
```

- A screenshot of your hero makes a good still. Keep `alt=""`: like the canvas, which is `aria-hidden`, it is decoration.
- The fallback takes the canvas's place, so make it fill the container.
- `'use client'` is only needed for `onError`. Without it, you can pass `fallback` straight from a Server Component.

**An image for reduced motion, too.** If you'd rather show the still image than a frozen frame:

```tsx
'use client';

import { DotMorph, usePrefersReducedMotion } from 'dotmorph/react';

const still = (
  <img src="/hero-still.png" alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
);

export function CalmHero() {
  const reducedMotion = usePrefersReducedMotion();
  return <div style={{ height: 480 }}>{reducedMotion ? still : <DotMorph shape="globe" fallback={still} />}</div>;
}
```

On a server-rendered page the hook returns `false` during hydration, so a reduced-motion visitor briefly gets the canvas before the swap. To avoid even that, choose with CSS instead: render both, give the canvas `className="hero-canvas"` and the image `className="hero-still"`, and add:

```css
.hero-still { display: none; }
@media (prefers-reduced-motion: reduce) {
  .hero-still { display: block; }
  .hero-canvas { display: none; }
}
```

The hidden canvas still gets an engine, but with motion off it draws a single frame and never runs a loop.

## Vanilla JavaScript with resize and cleanup

The engine doesn't watch the page for you. This helper does most of what `DotMorph` does: it follows the canvas size, pauses off screen, respects reduced motion, falls back without WebGL 2, and cleans up.

```ts
import { DotMorphEngine, PALETTES, type ShapeName } from 'dotmorph';

export function mountDotMorph(container: HTMLElement, shape: ShapeName = 'burst') {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
  canvas.setAttribute('aria-hidden', 'true');
  container.style.background = PALETTES.ocean.background ?? '';
  container.append(canvas); // in the page first, so the engine can read its size

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let engine: DotMorphEngine;
  try {
    engine = new DotMorphEngine(canvas, { shape, palette: 'ocean', motion: !reducedMotion.matches });
  } catch (error) {
    canvas.remove();
    container.classList.add('dotmorph-failed'); // e.g. show a still image with CSS
    console.warn('dotmorph could not start', error);
    return { engine: null, destroy: () => {} };
  }

  let onScreen = false;
  const update = () => {
    if (onScreen && engine.motion) engine.start();
    else engine.stop(); // the canvas keeps its last frame
  };

  const resizeObserver = new ResizeObserver(() => engine.resize());
  resizeObserver.observe(canvas);

  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  });
  visibility.observe(canvas);

  const onMotionChange = () => {
    engine.motion = !reducedMotion.matches;
    update();
  };
  reducedMotion.addEventListener('change', onMotionChange);

  return {
    engine,
    destroy() {
      reducedMotion.removeEventListener('change', onMotionChange);
      visibility.disconnect();
      resizeObserver.disconnect();
      engine.dispose();
      canvas.remove();
    },
  };
}
```

Use it like this:

```ts
import { mountDotMorph } from './mount-dotmorph';

const hero = mountDotMorph(document.querySelector<HTMLElement>('#hero')!, 'globe');
hero.engine?.morphTo('wave');

// Later, for example when the page or route goes away:
hero.destroy();
```

- The engine draws a frame when it is created, on every `resize()`, and after `setSettings`, `setCloud`, `setPalette`, `engine.shapes.*.setParams()` and instant morphs. With motion off, you never need to start the loop.
- A morph started while the canvas is off screen waits and plays when it scrolls back. `DotMorph` makes such changes instant instead. Pass `false` as the second argument of `morphTo` to do the same.
- `dispose()` doesn't remove the canvas, so the helper does.
- To skip loading the library on devices without WebGL 2, check first with `document.createElement('canvas').getContext('webgl2')`, then `import('dotmorph')` only if that returns a context.

## Performance

dotmorph computes all motion in the vertex shaders, so the CPU does almost nothing per frame. The cost is mostly the number of vertices and pixels.

**Draw fewer elements.** Only shapes with presence above 0 are drawn: one between morphs, and usually two during a morph. The globe and the fan draw the most line vertices:

| shape | dots | line vertices | with defaults | params to lower |
| --- | --- | --- | --- | --- |
| burst | `rays` | `rays × 8` | 420 dots, 3,360 vertices | `rays` |
| globe | `arcs` | `arcs × segments × 2` | 220 dots, 17,600 vertices | `arcs`, `segments` |
| wave | `stems` | `stems × 2` | 340 dots, 680 vertices | `stems` |
| fan | `strands × 2` | `strands × (samples − 1) × 2` | 180 dots, 11,340 vertices | `strands`, `samples` |

**Cap the pixel ratio.** Filling pixels is the other main cost. On high-density screens, a large hero at the default cap of 2 draws four times the pixels of a ratio of 1.

```tsx
import { DotMorph } from 'dotmorph/react';

export function LightHero() {
  return (
    <div style={{ height: 460 }}>
      <DotMorph
        options={{
          maxPixelRatio: 1.5,
          shapes: {
            burst: { rays: 300 },
            globe: { arcs: 140, segments: 28 },
            wave: { stems: 240 },
            fan: { strands: 60, samples: 40 },
          },
        }}
      />
    </div>
  );
}
```

To lower the pixel ratio later, for example after you notice slow frames:

```ts
engine.renderer.setPixelRatio(1);
engine.resize();
```

**Don't render what nobody sees.** Keep `pauseWhenHidden` on (the default) in React. With the engine, use an `IntersectionObserver` as in the [vanilla recipe](#vanilla-javascript-with-resize-and-cleanup). With motion off there is no loop at all.

**Keep structural changes off the hot path.** Structural params and `setCloud` rebuild geometry. That is fine for a slider, but throttle continuous input, and never do it every frame. Live params are cheap.

**One engine per hero.** Each `DotMorph` or `DotMorphEngine` creates its own WebGL context, and browsers limit how many can be live at once. Prefer one hero per page over many small canvases.

---

Made by Shnyar: [X @shnulli](https://x.com/shnulli) · [GitHub @shniii](https://github.com/shniii) · [dotmorph.shni.me](https://dotmorph.shni.me)
