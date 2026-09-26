# dotmorph API reference

This is the complete reference for `dotmorph` 0.1.0. For a quick start, see the [README](../README.md). For copy-paste examples, see [Recipes](RECIPES.md). You can try every setting in the [playground](https://dotmorph.shni.me).

## Contents

- [Install and entry points](#install-and-entry-points)
- [React component: DotMorph](#react-component-dotmorph)
  - [Props](#props)
  - [Lifecycle and updates](#lifecycle-and-updates)
  - [Reduced motion](#reduced-motion)
  - [Pausing off screen](#pausing-off-screen)
  - [Errors and fallback](#errors-and-fallback)
  - [Next.js and 'use client'](#nextjs-and-use-client)
- [usePrefersReducedMotion](#useprefersreducedmotion)
- [DotMorphEngine](#dotmorphengine)
  - [Constructor](#constructor)
  - [EngineOptions](#engineoptions)
  - [Properties and getters](#properties-and-getters)
  - [Methods](#methods)
  - [The morph timeline](#the-morph-timeline)
  - [Pointer interaction](#pointer-interaction)
  - [Coordinates and sizing](#coordinates-and-sizing)
- [Engine settings](#engine-settings)
- [Cloud settings](#cloud-settings)
- [Palettes](#palettes)
- [Shapes](#shapes)
  - [Working with shapes](#working-with-shapes)
  - [Burst](#burst)
  - [Globe](#globe)
  - [Wave](#wave)
  - [Fan](#fan)
- [Custom shapes](#custom-shapes)
- [Other exports](#other-exports)
- [Credits](#credits)

## Install and entry points

```bash
npm install dotmorph three
npm install -D @types/three   # only if you use TypeScript
```

| entry | exports |
| --- | --- |
| `dotmorph` | The framework-agnostic core: `DotMorphEngine`, the four shape classes, palettes, defaults, helpers and types. |
| `dotmorph/react` | The `DotMorph` component, the `usePrefersReducedMotion` hook and the `DotMorphProps` type. It also re-exports `DotMorphEngine` and the `ShapeName`, `PaletteName` and `Palette` types. The built file starts with `'use client'`. |

- **Peer dependencies.** `three` 0.163.0 or newer is required (the first release that is WebGL 2 only). `react` 18 or newer is optional and only needed for `dotmorph/react`. dotmorph has no runtime dependencies of its own.
- **Format.** ESM only, with TypeScript declarations.
- **WebGL 2.** The shaders use GLSL ES 3.00 features (integer hashing), so a WebGL 2 context is required. three.js throws when it can't create one. The React component turns that into `onError` and `fallback`. With the engine, wrap the constructor in `try`/`catch`.
- **Browser only.** The engine reads `window.devicePixelRatio` and creates a WebGL context, so create it in the browser (in React, the component does this inside an effect). Importing either entry on the server is fine.

## React component: DotMorph

```tsx
import { DotMorph } from 'dotmorph/react';

export function Hero() {
  return (
    <div style={{ height: 420 }}>
      <DotMorph shape="globe" palette="aurora" />
    </div>
  );
}
```

`DotMorph` renders a transparent `<canvas>` that fills its parent (`width: 100%; height: 100%`). Give the parent a height and a background. Every built-in palette has a matching CSS `background` (see [Palettes](#palettes)). The canvas has `aria-hidden="true"`, so screen readers skip it. Keep your real content in HTML.

### Props

| prop | type | default | behaviour |
| --- | --- | --- | --- |
| `shape` | `ShapeName \| number` | `'burst'` | Shape to show: `'burst'`, `'globe'`, `'wave'` or `'fan'`, or an index from 0 to 3 in that order. Changing it runs a morph. The change is instant when motion is off or the canvas is off screen. |
| `palette` | `PaletteName \| Palette` | `'aurora'` | A built-in palette name or your own `{ top, bottom }` object. Changing it fades the colours over 0.7 s, or switches instantly when motion is off or the canvas is off screen. Custom objects are compared by `top`, `bottom` and `rampEnd`, so an inline object doesn't restart the fade on every render. |
| `motion` | `boolean` | `!usePrefersReducedMotion()` | Animate. See [Reduced motion](#reduced-motion). |
| `transitionDuration` | `number` | `1.5` (engine default) | Seconds per morph. A change applies from the next morph. |
| `interactive` | `boolean` | `true` | Let the pointer push dots and lines aside. |
| `pauseWhenHidden` | `boolean` | `true` | Stop the render loop while the canvas is out of view. See [Pausing off screen](#pausing-off-screen). |
| `options` | `Omit<EngineOptions, 'shape' \| 'palette' \| 'motion' \| 'transitionDuration' \| 'interactive'>` | none | Everything else the engine accepts: `maxPixelRatio`, `cloud`, `shapes` (per-shape params) and the other [engine settings](#engine-settings). **Read once, on mount.** Later changes to this prop are ignored. Use `onReady` and the engine methods to change things afterwards. |
| `onReady` | `(engine: DotMorphEngine) => void` | none | Called once the engine exists. Use it to keep a reference or to tune the engine. |
| `onMorphEnd` | `(shape: ShapeName) => void` | none | Called when a morph finishes, with the shape now showing. See [`onMorphEnd`](#onmorphend). |
| `onError` | `(error: unknown) => void` | none | Called when the engine can't be created. See [Errors and fallback](#errors-and-fallback). |
| `fallback` | `ReactNode` | `null` | Rendered instead of the canvas when the engine can't be created. |
| `className` | `string` | none | Class name for the `<canvas>`. |
| `style` | `CSSProperties` | none | Inline style for the `<canvas>`, merged over the defaults `display: block; width: 100%; height: 100%; touch-action: pan-y`. |

`DotMorphProps`, the props interface, is exported from `dotmorph/react`.

The component always calls the latest version of `onReady`, `onMorphEnd` and `onError`, so inline arrow functions are fine. Changing them doesn't recreate the engine.

### Lifecycle and updates

**On mount**, the component creates one `DotMorphEngine` for its canvas. It passes `shape`, `palette`, `motion`, `interactive`, `transitionDuration` (when set) and everything in `options`. Then it calls `onReady(engine)`. A `ResizeObserver` calls `engine.resize()` whenever the canvas changes size.

**On unmount**, it disconnects its observers and calls `engine.dispose()`.

**After mount**, props are applied like this:

| prop | what the component does when it changes |
| --- | --- |
| `shape` | `engine.morphTo(shape, motion && onScreen)` |
| `palette` | `engine.setPalette(palette, motion && onScreen)` |
| `motion` | sets `engine.motion`, then starts or stops the loop |
| `transitionDuration`, `interactive` | `engine.setSettings(...)` |
| `pauseWhenHidden` | starts or stops watching the canvas's visibility |
| `options` | nothing (read once, on mount) |

The component applies these props right after `onReady` runs. It applies `shape`, `palette` and `motion` again whenever motion turns on or off and whenever the canvas scrolls in or out of view. So values you set yourself with `morphTo`, `setPalette`, `engine.motion` or `setSettings({ interactive, transitionDuration })` can be overwritten by the props. Control those through props. Use the engine for everything else: `setSettings` for the other settings, `setCloud`, and `engine.shapes.*.setParams`.

In development, React Strict Mode mounts effects twice. The engine is created, disposed and created again, so `onReady` runs twice. Keep only the latest engine, for example with `onReady={setEngine}`.

### Reduced motion

`motion` defaults to the visitor's system setting. It is off when `(prefers-reduced-motion: reduce)` matches, and it follows changes to that setting live. When motion is off, the component:

- stops the render loop and draws a single still frame;
- freezes time, so shapes don't sway, spin or pulse;
- makes morphs and palette changes instant;
- turns off the pointer effect in practice, because the pointer is only eased and applied while the loop runs.

Pass `motion={true}` or `motion={false}` to override the system setting.

### Pausing off screen

With `pauseWhenHidden` on (the default), an `IntersectionObserver` watches the canvas. The loop runs only while the canvas is on screen. When it scrolls away, the loop stops and the canvas keeps its last frame. Shape and palette changes made while it is off screen are applied instantly. The loop doesn't start until the observer's first report. Where `IntersectionObserver` doesn't exist, the canvas is treated as always visible.

Browsers also pause `requestAnimationFrame` in background tabs, so the loop pauses there on its own.

### Errors and fallback

On mount, the component wraps `new DotMorphEngine(...)` in `try`/`catch`. If it throws, the component calls `onError(error)` and renders `fallback` (default `null`) in place of the canvas. The usual cause is a browser or device without WebGL 2, or a context that fails to start. An unknown shape name or palette name at mount ends up here too.

- The fallback replaces the canvas, so style it to fill the parent (for example `width: 100%; height: 100%; object-fit: cover` on an image).
- On a server-rendered page, the server renders the canvas. The fallback appears after the first render in the browser.
- Errors after mount are not caught. For example, changing `shape` to an unknown name throws from an effect. With TypeScript the prop types rule this out.

### Next.js and 'use client'

The published `dotmorph/react` file starts with `'use client'`, so you can render `<DotMorph>` straight from a Server Component in the Next.js App Router. From a Server Component, pass only serializable props: strings, numbers, booleans, plain objects such as `options` or a custom palette, and JSX for `fallback`. Functions (`onReady`, `onMorphEnd`, `onError`) need a client component of your own. You don't need `next/dynamic` with `ssr: false`. See the [Next.js recipe](RECIPES.md#nextjs-app-router-hero).

## usePrefersReducedMotion

```typescript
function usePrefersReducedMotion(): boolean;
```

From `dotmorph/react`. Returns `true` when the visitor's system asks for reduced motion (`(prefers-reduced-motion: reduce)`). It subscribes to changes and re-renders when the setting changes. `DotMorph` uses it for its default `motion`.

It is built on `useSyncExternalStore`: on the server and during hydration it returns `false`, then React re-renders with the real value, so server-rendered pages don't get a hydration mismatch. If you use it to swap markup, a reduced-motion visitor briefly sees the `false` version first; the [reduced motion recipe](RECIPES.md#reduced-motion-and-a-static-fallback) shows a CSS alternative that avoids even that.

## DotMorphEngine

The framework-agnostic engine. It renders four shapes on a transparent canvas with three.js and morphs between them through a cloud of dots.

```ts
import { DotMorphEngine } from 'dotmorph';

const engine = new DotMorphEngine(canvas, { shape: 'burst', palette: 'ocean' });
engine.start();
engine.morphTo('globe');
```

### Constructor

```typescript
new DotMorphEngine(canvas: HTMLCanvasElement, options?: EngineOptions)
```

The constructor:

- creates a three.js `WebGLRenderer` on the canvas (antialiased, transparent background, `powerPreference: 'high-performance'`), a `PerspectiveCamera` and a `Scene`;
- builds all four shapes and shows only the starting one;
- adds `pointermove` and `pointerleave` listeners to the canvas;
- sizes everything to the canvas and draws one frame.

It does **not** start the render loop. Call [`start()`](#start-and-stop).

Put the canvas in the page and size it with CSS before you create the engine. The drawing buffer is sized from the canvas's `clientWidth` and `clientHeight`. If those are 0, it falls back to the canvas's `width` and `height` attributes.

The engine does not check `prefers-reduced-motion`. Pass `motion` yourself (the React component does).

**Throws**

- `RangeError` for an unknown shape name or an index outside 0 to 3 (see [`toShapeName`](#other-exports)).
- An `Error` from three.js when no WebGL 2 context can be created.
- A `TypeError` for an unknown palette name. Palette names are not validated, so the error comes from reading the missing palette.

### EngineOptions

`EngineOptions` extends `Partial<EngineSettings>`, so every [engine setting](#engine-settings) can be passed too. It adds:

| option | type | default | meaning |
| --- | --- | --- | --- |
| `shape` | `ShapeName \| number` | `'burst'` | Shape shown first. |
| `palette` | `PaletteName \| Palette` | `'aurora'` | Starting palette. |
| `motion` | `boolean` | `true` | Animate. When `false`, time stands still and morphs are instant. |
| `maxPixelRatio` | `number` | `2` | Upper bound for `devicePixelRatio`. Read once. |
| `cloud` | `Partial<CloudSettings>` | [`CLOUD_DEFAULTS`](#cloud-settings) | Layout of the cloud. |
| `shapes` | `{ burst?: Partial<BurstParams>; globe?: Partial<GlobeParams>; wave?: Partial<WaveParams>; fan?: Partial<FanParams> }` | each shape's defaults | Starting params per shape. Passing them here avoids a rebuild later. |

```ts
import { DotMorphEngine } from 'dotmorph';

const engine = new DotMorphEngine(canvas, {
  shape: 'globe',
  palette: 'ocean',
  transitionDuration: 2,
  stagger: 0.5,
  maxPixelRatio: 1.5,
  cloud: { radius: 1.6 },
  shapes: {
    globe: { arcs: 300, spin: 0.08 },
    burst: { rays: 600, origin: { x: 0, y: -3.4, z: -1 } },
  },
});
```

- Object values such as `origin`, `center`, `tilt`, `offset` and `cloudCenter` must be complete `{ x, y, z }` objects.
- Keys set to `undefined` are ignored and keep their default, here and in `setSettings`, `setCloud` and `shapes`.

### Properties and getters

| member | type | description |
| --- | --- | --- |
| `canvas` | `HTMLCanvasElement` (read-only) | The canvas passed to the constructor. |
| `renderer` | `WebGLRenderer` (read-only) | The three.js renderer. For example, call `engine.renderer.setPixelRatio(1)` and then `engine.resize()` to change the pixel ratio later. |
| `camera` | `PerspectiveCamera` (read-only) | A 40° vertical field of view. `resize()` positions it. |
| `scene` | `Scene` (read-only) | Holds the four shape groups. |
| `settings` | `EngineSettings` (read-only) | Current [engine settings](#engine-settings). Treat it as read-only and change values with `setSettings()`, which also updates the shaders. |
| `cloud` | `CloudSettings` (read-only) | Current [cloud layout](#cloud-settings). Change it with `setCloud()`. |
| `shapes` | `{ burst: BurstShape; globe: GlobeShape; wave: WaveShape; fan: FanShape }` (read-only) | The four shape instances. Use them to read and change params: `engine.shapes.globe.setParams({ spin: 0.1 })`. |
| `onMorphEnd` | `((shape: ShapeName) => void) \| null` | Callback for finished morphs. See [`onMorphEnd`](#onmorphend). |
| `shape` | `ShapeName` (getter) | The shape showing, or the one being morphed to. |
| `isMorphing` | `boolean` (getter) | `true` while a morph is in progress. |
| `isRunning` | `boolean` (getter) | `true` while the render loop is running. |
| `motion` | `boolean` (getter and setter) | Whether animation is on. See [`motion`](#motion). |

### Methods

#### morphTo

```typescript
morphTo(shape: ShapeName | number, animate?: boolean): void
```

Morph to another shape. `animate` defaults to `engine.motion`.

- The shape is checked with `toShapeName`, which throws a `RangeError` for unknown names and out-of-range indices.
- If the shape is already showing and no morph is running, nothing happens and `onMorphEnd` doesn't fire.
- With `animate` set to `false`, the switch is instant. `onMorphEnd` fires right away, inside the call, and a frame is drawn if the loop is stopped.
- With `animate` set to `true`, a morph starts. It lasts `settings.transitionDuration` seconds (at least 0.05 s), read at this moment. Changing the duration during a morph affects only the next one. The morph advances in `tick()`, so it only moves while the loop runs (or while you call `tick()` yourself).
- A call during a morph starts a new morph from wherever every shape is at that moment, so nothing jumps. The interrupted morph's `onMorphEnd` never fires.

```ts
engine.morphTo('globe');
engine.morphTo(2); // 'wave'
engine.morphTo('fan', false); // switch instantly
```

#### setPalette

```typescript
setPalette(palette: PaletteName | Palette, animate?: boolean): void
```

Switch palette. `animate` defaults to `engine.motion && engine.isRunning`. When animated, the dot and line colours fade over 0.7 s with a smooth ease. The fade advances in `tick()`. Otherwise the new colours apply at once. A frame is drawn if the loop is stopped. The engine never touches the page background: update your container's CSS yourself.

#### getPalette

```typescript
getPalette(): Palette
```

The palette last set. For a built-in name this is the `PALETTES` entry itself, so don't mutate it.

#### setSettings

```typescript
setSettings(patch: Partial<EngineSettings>): void
```

Merge new [engine settings](#engine-settings). A `cloudCenter` you pass is merged into the current one, but the type still asks for all three coordinates. Values that feed the shaders apply on the next frame. `transitionDuration` applies from the next morph. A frame is drawn if the loop is stopped.

```ts
engine.setSettings({ transitionDuration: 2.2, stagger: 0.5, swoop: 0.8 });
engine.setSettings({ cloudCenter: { x: 1.5, y: 0.2, z: 0 } });
```

#### setCloud

```typescript
setCloud(patch: Partial<CloudSettings>): void
```

Merge a new [cloud layout](#cloud-settings) and rebuild the geometry of all four shapes, because every dot gets a new slot in the cloud. This is heavier than `setSettings`. It is fine from a slider, but don't call it every frame. A frame is drawn if the loop is stopped.

#### start and stop

```typescript
start(): void
stop(): void
```

`start()` begins a `requestAnimationFrame` loop that calls `tick()` every frame. It does nothing if the loop is already running or the engine is disposed. `stop()` cancels the loop. The canvas keeps its last frame. Stopping doesn't change `motion`.

#### tick

```typescript
tick(now?: number): void
```

Advance one frame and render it. `now` is a timestamp in milliseconds on the `performance.now()` clock (a `requestAnimationFrame` timestamp works) and defaults to `performance.now()`. The step is capped at 0.1 s, so a long gap doesn't make things jump. `start()` calls this for you. Call it yourself only if you drive frames from your own loop, and don't combine that with `start()`.

After `dispose()` it does nothing.

Each tick advances the engine clock (morphs and palette fades), advances animation time when motion is on, eases the pointer, runs each visible shape's `update()` and renders.

#### renderOnce

```typescript
renderOnce(): void
```

Draw one frame without advancing time. It does nothing after `dispose()`. Call it after `engine.shapes.*.setParams()` while the loop is stopped, because `setParams` doesn't draw on its own.

#### resize

```typescript
resize(): void
```

Match the drawing buffer to the canvas's CSS size times the pixel ratio, reposition the camera, and update the height-based dot scaling (see [Coordinates and sizing](#coordinates-and-sizing)). Call it whenever the canvas changes size. `DotMorph` does this with a `ResizeObserver`. A frame is drawn if the loop is stopped.

#### dispose

```typescript
dispose(): void
```

Stop the loop, remove the pointer listeners, and dispose every geometry, material and the renderer. A disposed engine can't be restarted, so create a new one. The canvas element stays in the page. Remove it yourself if you need to.

#### shapeByName

```typescript
shapeByName(name: ShapeName): ShapeHandle
```

Returns a shape as the small [`ShapeHandle`](#other-exports) interface: `name`, `group`, `presence`, `setPresence()`, `rebuild()` and the engine hooks. It has no `setParams`. For typed params, use `engine.shapes.burst`, `engine.shapes.globe` and so on.

#### onMorphEnd

```ts
engine.onMorphEnd = (shape) => console.log('now showing', shape);
```

Assign a function, or `null`. It is called with the shape now showing when:

- an animated morph completes;
- an instant morph happens (synchronously, inside `morphTo`);
- motion is turned off during a morph, which snaps the morph to its end.

With `DotMorph`, use the `onMorphEnd` prop. The component sets `engine.onMorphEnd` itself, and assigning it in `onReady` would disconnect the prop.

#### motion

```ts
engine.motion = false;
```

Reading it tells you whether animation is on. Setting it to `false` freezes time, snaps a running morph to its end (firing `onMorphEnd`) and makes later morphs and palette changes instant by default. It does **not** stop the loop: call `stop()` as well to save work (`DotMorph` does both). Setting it to `true` resumes animation from the next tick.

### The morph timeline

Every shape has a **presence** value from 0 to 1. At 1 the shape is fully formed. At 0 all of its dots sit in the cloud and its lines are hidden. A morph moves presence over `transitionDuration` seconds. Below, `p` is the share of the morph that has passed, from 0 to 1.

| part of the morph | leaving shape | arriving shape |
| --- | --- | --- |
| `p` from 0 to 0.6 | presence falls linearly from 1 to 0 | hidden (presence 0) |
| `p` from 0.4 to 1 | hidden once it reaches 0 | presence rises linearly from 0 to 1 |

**Lines** are fully drawn at presence 1 and hidden at or below `lineStart`. They draw in from their anchor (`aAlong` 0) to their tip (`aAlong` 1) and retract the same way, tip first. So:

- the leaving shape's lines are gone by `p = 0.6 × (1 − lineStart)`, which is 0.27 with the default `lineStart` of 0.55;
- the arriving shape's lines start at `p = 0.4 + 0.6 × lineStart`, which is 0.73 with the default.

**Dots** each have a random seed `s` from 0 to 1. A dot flies while its shape's presence passes from `s × stagger` to `s × stagger + (1 − stagger)`. With `stagger` at 0, every dot flies at the same time across the whole ramp. With the default 0.35, each dot's flight covers 65 % of the ramp, and the start times spread over the first 35 %. A dot travels on a quadratic Bézier curve between its cloud slot and its place in the shape, bent sideways by a random amount scaled by `swoop` and the length of the flight, and eased with a smootherstep curve.

**In the cloud**, dots are drawn at `cloudDotScale` times their size and `cloudOpacity` times their opacity, and blend to full size and opacity as they land. A shape's dots fade out while its presence is below 0.06. So around the middle of a morph, the old shape's dots fade out in the cloud as the new shape's dots fade in. The cloud turns about the vertical axis at `cloudSpin` radians per second and gently grows and shrinks by about 7 %.

**When the morph ends**, presences snap to exactly 0 and 1, and `onMorphEnd` fires. Shapes at presence 0 are hidden and skipped, so between morphs only the showing shape is drawn.

**Two clocks.** Morphs and palette fades run on the engine clock, which advances on every `tick()`. Shape animation (sway, spin, pulses) and the cloud's turning run on animation time, which advances only while motion is on. So with motion off and the loop running, a morph forced with `morphTo(shape, true)` still plays, while the shapes themselves stay still.

### Pointer interaction

When `interactive` is on and the loop is running, moving the pointer over the canvas pushes nearby dots and lines away on screen.

- Dots are pushed in proportion to how far they have landed, so dots in the cloud barely move. Lines are pushed in proportion to `aAlong`, so tips move and anchors stay put. The fan's strands have a dot at each end, so they move as a whole.
- The push follows the pointer with a short lag. It fades away within a second or two after the pointer stops moving, and when the pointer leaves the canvas.
- `pointerRadius` sets the reach. A value of 1 equals half the canvas height, so the default 0.32 reaches about 16 % of the canvas height. `pointerStrength` scales the push.
- The listeners sit on the canvas. Elements layered on top of it block the effect unless they have `pointer-events: none`.
- `DotMorph` sets `touch-action: pan-y` on the canvas, so vertical page scrolling still works on touch screens.

### Coordinates and sizing

- **World units.** The origin is the centre of the canvas, `y` points up and `z` points towards the viewer. The camera looks at the origin from `z` = 6.2 or further. On canvases wider than about 2.08:1, it stays at 6.2 and shows about 4.5 units of height at `z` = 0. On narrower canvases it moves back so that about 9.4 units of width stay visible. Shapes keep their width on phones and gain room above and below.
- **Dot size.** On screen, a dot is roughly `dotSize` CSS pixels, times the shape's own scale for that dot, times `clamp(canvas height / 520, 0.55, 1.6)`. In the cloud it is also multiplied by `cloudDotScale`. So dots grow with taller canvases, between 0.55× and 1.6×.
- **Pixel ratio.** The drawing buffer uses `min(devicePixelRatio, maxPixelRatio)`, set once in the constructor. To change it later, call `engine.renderer.setPixelRatio(value)` and then `engine.resize()`.
- **Colour ramp.** Colours come from each dot's and line's height on the canvas, not in the scene. The ramp stays fixed to the canvas while the shapes move through it. See [Palettes](#palettes).

## Engine settings

`EngineSettings` holds the engine-wide look and feel. Pass any of these to the constructor, and change them later with `setSettings()`. The defaults are exported as `ENGINE_DEFAULTS`.

| setting | default | meaning |
| --- | --- | --- |
| `transitionDuration` | `1.5` | Seconds for a full morph from one shape to another. The minimum is 0.05. It is read when a morph starts. |
| `stagger` | `0.35` | 0 to 0.9 (clamped). How spread out in time the dots leave and arrive. At 0 they all move together. Higher values make them leave one after another, each flying faster. |
| `swoop` | `0.45` | How far each flight path bends sideways, relative to its length. 0 gives straight paths. |
| `dotSize` | `5.5` | Base dot diameter in CSS pixels, before the per-shape scale and the canvas-height factor (see [Coordinates and sizing](#coordinates-and-sizing)). |
| `cloudDotScale` | `0.7` | Dot size inside the cloud, relative to the dot's size in a shape. |
| `cloudOpacity` | `0.9` | Dot opacity inside the cloud. |
| `cloudSpin` | `0.35` | Radians per second the cloud turns about the vertical axis. It runs on animation time, so it stops when motion is off. |
| `cloudCenter` | `{ x: 0, y: 0.15, z: 0 }` | Centre of the cloud in world units. Changing it is cheap, with no rebuild. |
| `lineStart` | `0.55` | 0 to 0.95 (clamped). Presence above which lines start drawing in. Higher values draw lines in later and retract them sooner. |
| `interactive` | `true` | React to the pointer. |
| `pointerRadius` | `0.32` | Reach of the pointer push, where 1 is half the canvas height. |
| `pointerStrength` | `1` | Strength of the pointer push. |

The clamps apply to what the shaders receive. `engine.settings` keeps the values you passed.

## Cloud settings

`CloudSettings` sets the size and layout of the cloud that dots gather in during a morph. Every dot of every shape has a fixed slot in the cloud. The slots are spread through an ellipsoid and packed more densely towards the middle. Pass these as `options.cloud`, and change them with `setCloud()`, which rebuilds all four shapes. The defaults are exported as `CLOUD_DEFAULTS`. The cloud's position is the `cloudCenter` [engine setting](#engine-settings).

| setting | default | meaning |
| --- | --- | --- |
| `radius` | `1.25` | Radius of the cloud along `x`, in world units. |
| `flatten` | `0.7` | Scale of `y` and `z` relative to `x`. Below 1 gives a flatter cloud. |
| `seed` | `7` | Seed for the slot layout. |

The cloud only exists during a morph. Between morphs, the showing shape's dots are all in place.

## Palettes

A palette colours the dots and lines with a vertical ramp fixed to the canvas. The `bottom` colour sits at the bottom edge and blends smoothly into the `top` colour, which it reaches at `rampEnd` (a share of the canvas height) and keeps above that. The canvas is transparent. The engine never paints a background, but every palette suggests one.

### The Palette interface

```typescript
interface Palette {
  top: string;
  bottom: string;
  rampEnd?: number;
  background?: string;
  dark?: boolean;
}
```

| field | meaning |
| --- | --- |
| `top` | Colour at the top of the ramp. Any colour string three.js's `Color` reads, such as hex, `rgb()`, `hsl()` or a CSS colour name. |
| `bottom` | Colour at the bottom of the ramp. |
| `rampEnd` | Share of the canvas height (0 to 1) where the ramp reaches `top`. Default 0.8. |
| `background` | Suggested CSS `background` for the element behind the canvas. The engine doesn't use it. |
| `dark` | `true` when the palette is made for a dark background. The engine doesn't use it. |

The engine reads only `top`, `bottom` and `rampEnd`.

Dots and lines are drawn in exactly the colours you pass: the ramp is mixed in sRGB, like CSS gradients, so `#22c486` on the canvas matches `#22c486` in your stylesheet.

### Built-in palettes

`PALETTES` maps each name to its `Palette`. `PALETTE_NAMES` lists the names in this order. `PaletteName` is their union type.

| name | top | bottom | rampEnd | dark | description |
| --- | --- | --- | --- | --- | --- |
| `aurora` | `#22c486` | `#6d3cf2` | 0.8 (default) | no | Green into violet, like northern lights. |
| `ocean` | `#2d8cf0` | `#1d2a9c` | 0.8 (default) | no | Azure into deep indigo. |
| `ember` | `#ffa43a` | `#e0314f` | 0.8 (default) | no | Amber into red. |
| `mint` | `#2fd3c0` | `#1768c9` | 0.8 (default) | no | Aqua into blue. |
| `rose` | `#ff5c8a` | `#9b1c7a` | 0.8 (default) | no | Rose into plum. |
| `midnight` | `#9af0ff` | `#8a63ff` | 0.9 | yes | Ice into violet, on a dark night. |

Every built-in palette's `background` is generated by `paletteBackground(top, bottom, dark)`:

```ts
import { PALETTES } from 'dotmorph';

const light = PALETTES.aurora.background;
// radial-gradient(140% 110% at 50% 115%, #536ccc 0%, #4ed09e 20%, #a7e7cf 40%, #e0f7ee 58%, #f7fdfb 78%)
const dark = PALETTES.midnight.background;
// radial-gradient(140% 110% at 50% 115%, #8d7fff 0%, #523c99 24%, #261d4a 46%, #0d0c1d 72%)
```

### paletteBackground

```typescript
function paletteBackground(top: string, bottom: string, dark?: boolean): string;
```

Builds a CSS radial gradient from the palette's two colours: a soft glow rising from the bottom edge. It is tinted near the bottom and fades towards the top into a pale paper tone, or into a deep night tone when `dark` is `true` (default `false`). It accepts only `#rgb` and `#rrggbb` colours and throws a `TypeError` for anything else. Use it for your own palettes, too.

### resolvePalette

```typescript
function resolvePalette(palette: PaletteName | Palette): Palette;
```

Returns the `PALETTES` entry for a name, or your palette object unchanged. Unknown names aren't checked and return `undefined` at runtime.

### Custom palettes

Any `{ top, bottom }` object works wherever a palette name does:

```ts
import { paletteBackground, type Palette } from 'dotmorph';

const top = '#7cf5c4';
const bottom = '#1d4ed8';
export const brand: Palette = { top, bottom, rampEnd: 0.75, background: paletteBackground(top, bottom) };

engine.setPalette(brand);
```

See [Recipes: your own palette](RECIPES.md#your-own-palette) and [Recipes: match a dark site](RECIPES.md#match-a-dark-site).

## Shapes

There are four shapes. Each is a class that extends [`Shape`](#custom-shapes), with a params interface and a defaults object:

| name | index | class | params | defaults |
| --- | --- | --- | --- | --- |
| `burst` | 0 | `BurstShape` | `BurstParams` | `BURST_DEFAULTS` |
| `globe` | 1 | `GlobeShape` | `GlobeParams` | `GLOBE_DEFAULTS` |
| `wave` | 2 | `WaveShape` | `WaveParams` | `WAVE_DEFAULTS` |
| `fan` | 3 | `FanShape` | `FanParams` | `FAN_DEFAULTS` |

### Working with shapes

The engine creates one instance of each shape. Reach them through `engine.shapes`:

```ts
engine.shapes.globe.setParams({ spin: 0.1, backOpacity: 0.3 }); // live: next frame
engine.shapes.burst.setParams({ rays: 900 }); // structural: rebuilds the burst
const arcs = engine.shapes.globe.params.arcs; // current value
const spin = engine.shapes.globe.defaults.spin; // default value
```

To set starting values, pass them to the constructor as `options.shapes` (or in the `options` prop). That way they are built once.

**`setParams(patch: Partial<P>): void`**

- Only the keys you pass change. `undefined` values are skipped.
- Object values (`{ x, y, z }`) are replaced whole, so pass all three coordinates.
- Every param is either **live** or **structural**. Live params go straight to the shader and apply on the next frame. If any structural param actually changes value, the shape's geometry is rebuilt: new buffers, same presence. The tables below mark each param.
- If the engine's loop is stopped (motion off, off screen, or never started), `setParams` draws one frame so the change shows right away.
- Some values are clamped before they reach the shader, as noted in the tables. `params` keeps what you passed.

**Other members of every shape**

| member | description |
| --- | --- |
| `name` | The shape's name. |
| `params` | Current params. Read them here, and change them with `setParams()`. |
| `defaults` | The shape's defaults object (`BURST_DEFAULTS` and so on). It is shared, so don't mutate it. |
| `group` | The three.js `Group` holding the shape's `Points` (dots) and `LineSegments` (lines). Its transform applies to the whole shape, including where its dots gather, so a moved group's cloud no longer lines up with the other shapes' during a morph. |
| `presence` | Current presence, from 0 to 1. |
| `setPresence(value)` | Set presence directly. The group is hidden at 0. The engine overwrites presence during every morph and when a morph ends. |
| `rebuild()` | Throw away and rebuild the geometry. `setParams` and `setCloud` call it when needed. |
| `attach(ctx)`, `update(time, delta)`, `dispose()` | Called by the engine. Don't call them yourself. |

### Burst

Rays fan up from a point just below the frame, spread on a golden-angle spiral over a tilted cone, with a dot on every tip. The tips sway on smooth noise, the rays slowly lengthen and shorten, and the tip dots twinkle.

It draws `rays` dots and `rays × 8` line vertices (4 segments per ray).

| param | default | kind | meaning |
| --- | --- | --- | --- |
| `rays` | `420` | structural | Number of rays, with one dot on each tip. |
| `origin` | `{ x: 0, y: -3.1, z: -1 }` | live | Where every ray starts, in world units. |
| `minLength` | `2.6` | structural | Shortest ray, in world units. |
| `maxLength` | `4.3` | structural | Longest ray, in world units. Each ray picks a length between the two. |
| `spread` | `84` | structural | Half-angle of the cone the rays fill, in degrees. 90 is a full half-dome. Clamped to 1 to 179. |
| `lean` | `14` | structural | Tilt of the cone towards the viewer, in degrees. |
| `seed` | `3` | structural | Seed for directions and lengths. |
| `sway` | `0.06` | live | How far rays sway, as a fraction of their direction. |
| `swaySpeed` | `0.28` | live | How fast rays sway. |
| `breathe` | `0.035` | live | How much rays lengthen and shorten over time, as a fraction of their length. |
| `twinkle` | `0.4` | live | 0 to 1 (clamped). How strongly the tip dots fade in and out. |
| `minDotScale` | `0.55` | live | Smallest dot, relative to `dotSize`. |
| `maxDotScale` | `1.2` | live | Largest dot, relative to `dotSize`. |
| `lineOpacity` | `0.42` | live | Opacity of the rays at their tips. |
| `lineFade` | `0.6` | live | Share of each ray, from the origin, that fades out, so the rays don't clump where they meet. |

### Globe

A large tilted globe sits low in the frame, drawn only with meridian arcs. Each arc grows from a start point, then retracts into its end, led by a dot at its moving head. Each arc has its own start, span, rhythm and direction. The globe turns slowly, and the far side fades back.

It draws `arcs` dots and `arcs × segments × 2` line vertices.

| param | default | kind | meaning |
| --- | --- | --- | --- |
| `arcs` | `220` | structural | Number of meridian arcs (and head dots), evenly spread in longitude. |
| `segments` | `40` | structural | Line segments per arc. More gives smoother curves. |
| `jitter` | `0.6` | structural | 0 to 1. Random longitude offset of each arc, as a fraction of the gap between neighbours. |
| `seed` | `5` | structural | Seed for every per-arc pick: longitude jitter, start, span, period, phase and direction. |
| `radius` | `5.2` | live | Radius of the sphere in world units (at least 0.01). |
| `center` | `{ x: 0.5, y: -3.3, z: -2.6 }` | live | Centre of the sphere in world units. It sits below the frame, so only the upper part shows. |
| `tilt` | `{ x: 15, y: 0, z: -15 }` | live | Tilt of the globe's axis in degrees around `x`, `y` and `z` (applied in that order, after the spin). |
| `spin` | `0.05` | live | Turn speed about the globe's own axis, in radians per second. |
| `poleGap` | `7` | live | Colatitude kept clear around the north pole, in degrees, so arcs don't pile up there. Clamped to 0 to 179. |
| `reach` | `118` | live | Colatitude where arcs stop, in degrees. 90 is the equator and 180 the south pole. Kept at least 1° past `poleGap`. |
| `minSpan` | `0.25` | live | Shortest arc, as a fraction of the band between `poleGap` and `reach`. Clamped to 0.01 to 1. |
| `maxSpan` | `0.6` | live | Longest arc, as a fraction of the same band. Clamped to 0.01 to 1. |
| `minPeriod` | `8` | live | Shortest life cycle of an arc (grow, then retract), in seconds. At least 0.5. |
| `maxPeriod` | `13` | live | Longest life cycle of an arc, in seconds. At least 0.5. |
| `grow` | `0.5` | live | 0.05 to 0.95 (clamped). Share of each life the head spends growing. The tail follows during the rest. |
| `reverse` | `0.5` | live | 0 to 1. Share of arcs whose head runs towards the north pole instead of away from it. |
| `tailFade` | `0.45` | live | Length of the soft fade behind the tail, as a fraction of the arc. |
| `lineOpacity` | `0.5` | live | Opacity of the arcs on the side facing the viewer. |
| `backOpacity` | `0.14` | live | 0 to 1. Opacity multiplier for arcs and dots on the far side. |
| `dotScale` | `0.85` | live | Size of the head dots, relative to `dotSize`. |

Changing `minPeriod`, `maxPeriod` or `spin` moves arcs to a new point in their cycle or turn, because these are computed from the running time.

### Wave

A ribbon of vertical stems stands along a path that swings left and right while it climbs away from the viewer, like a fence winding up a hill. A dot sits on top of every stem. The tops bob gently, and a pulse travels up the ribbon now and then, lifting and brightening the stems it passes.

The path runs from `s` = 0 (nearest the viewer, low) to `s` = 1 (far and high): `x = amplitude × sin(2π × turns × s + phase)`, `y = rise × s`, `z = −depth × s`, then shifted by `offset`. Stems are spaced evenly by length along it.

It draws `stems` dots and `stems × 2` line vertices.

| param | default | kind | meaning |
| --- | --- | --- | --- |
| `stems` | `340` | structural | Number of stems (and dots), spaced evenly by length along the path. |
| `amplitude` | `5.2` | structural | How far the path swings left and right of its centre line, in world units. |
| `turns` | `1.75` | structural | Number of full left-right swings between the near end and the far end. |
| `phase` | `-0.8` | structural | Where in its swing the path starts, in radians. 0 is the centre, heading right. |
| `rise` | `9` | structural | How far the path climbs from the near end to the far end, in world units. |
| `depth` | `16` | structural | How far the path recedes from the near end to the far end, in world units. |
| `offset` | `{ x: 0.3, y: -2.4, z: 0 }` | live | Position of the path's near end (`s` = 0). |
| `seed` | `5` | structural | Seed for the per-stem height variation. |
| `height` | `3.5` | live | Length of each stem, hanging down from its dot, in world units. |
| `heightJitter` | `0.18` | live | 0 to 1 (clamped). How much shorter some stems are at random. 0 makes them all the same length. |
| `bob` | `0.07` | live | How far the stem tops bob up and down, in world units. |
| `bobSpeed` | `0.9` | live | How fast the tops bob, in radians per second. |
| `pulsePeriod` | `7` | live | Seconds between two pulses travelling up the ribbon. 0 turns the pulse off. |
| `pulseDuration` | `5` | live | Seconds a pulse takes to travel from the near end to the far end. Kept between 0.05 and `pulsePeriod`. |
| `pulseWidth` | `0.09` | live | Half-width of the pulse, as a fraction of the ribbon's length. 0 turns the pulse off. |
| `pulseLift` | `0.3` | live | How far the pulse lifts the stem tops it passes, in world units. |
| `pulseGlow` | `1.2` | live | How much brighter stems and dots get at the pulse. 0 means no change, 1 twice as bright. Opacity never goes above 1. |
| `pulseDotScale` | `0.7` | live | How much larger dots get at the pulse. 0 means no change, 1 twice as large. |
| `farOpacity` | `0.08` | live | Opacity multiplier at the far end (`s` = 1). Everything fades linearly towards it. |
| `lineOpacity` | `0.4` | live | Opacity of the stems at their tops, before the distance fade. |
| `lineFade` | `1` | live | 0 to 1 (clamped). How much each stem fades towards its bottom. 1 makes the bottom invisible. |
| `dotScale` | `0.95` | live | Dot size at the near end, relative to `dotSize`. |
| `farDotScale` | `0.55` | live | Dot size at the far end, as a fraction of `dotScale`. |

### Fan

A bow tie of smooth strands. Every strand leaves a point in a left column, sweeps through a narrow waist and ends at a point in a right column, with a dot at each end. Each strand draws itself in from left to right, holds, erases from left to right and rests, on its own rhythm. The wings drift gently while the ends and the waist stay put.

A cycle has four parts: drawing (`drawPortion`), holding (whatever is left over), erasing (`erasePortion`) and resting, fully hidden (`restPortion`). If the three shares add up to more than 0.98, they are scaled down together.

It draws `strands × 2` dots and `strands × (samples − 1) × 2` line vertices.

| param | default | kind | meaning |
| --- | --- | --- | --- |
| `strands` | `90` | structural | Number of strands, with two dots each. |
| `samples` | `64` | structural | Points per strand, spaced evenly by length (at least 4). More gives smoother curves. |
| `leftX` | `-3.7` | structural | `x` of the left column, in world units. |
| `rightX` | `3.7` | structural | `x` of the right column, in world units. |
| `leftSpread` | `3.9` | structural | Height of the left column the strands start from, in world units. |
| `rightSpread` | `3.1` | structural | Height of the right column the strands end at, in world units. |
| `centerY` | `0.05` | structural | Vertical centre of both columns. |
| `waistX` | `0` | structural | `x` of the waist, where the strands pinch together. |
| `waistY` | `0.1` | structural | Vertical centre of the waist. |
| `waistWidth` | `0.5` | structural | Height of the band the strands pass through at the waist, in world units. |
| `bulge` | `0.55` | structural | 0 to 1. How far the strands stay pulled together either side of the waist, as a fraction of the distance to each column. Higher gives a longer, tighter waist. |
| `endEase` | `0.3` | structural | 0 to 1. How far each strand leaves its column level before it turns towards the waist, as a fraction of the distance to the waist. |
| `cross` | `0.2` | structural | 0 to 1. Share of mirrored strand pairs that swap their right ends, so they cross over at the waist. |
| `depth` | `0.8` | structural | Depth spread of the strands, mostly at the waist, in world units. |
| `seed` | `11` | structural | Seed for the waist, depth, crossings and rhythms. |
| `minPeriod` | `6` | live | Shortest cycle of a strand, in seconds (at least 0.5). Changing it moves strands to a new point in their cycle. |
| `maxPeriod` | `11` | live | Longest cycle of a strand, in seconds (at least `minPeriod`). Each strand picks its own period between the two. |
| `drawPortion` | `0.3` | live | Share of a cycle spent drawing in, from left to right. Clamped to 0.02 to 0.9. |
| `erasePortion` | `0.28` | live | Share of a cycle spent erasing, from left to right. Clamped to 0.02 to 0.9. |
| `restPortion` | `0.12` | live | Share of a cycle a strand stays hidden before it draws again. Clamped to 0 to 0.9. |
| `softness` | `0.05` | live | Length of the soft fade at the drawing head and the erasing tail, as a fraction of the strand. Clamped to 0.005 to 0.5. |
| `drift` | `0.06` | live | How far the wings drift up and down, in world units. The ends and the waist stay put. |
| `driftSpeed` | `0.18` | live | How fast the wings drift. |
| `lineOpacity` | `0.45` | live | Opacity of a fully drawn strand. Each strand also gets its own brightness between 0.6 and 1. |
| `waistFade` | `0.5` | live | 0 to 1 (clamped). How much strands thin out where they bunch up at the waist. |
| `dotScale` | `0.85` | live | Size of the end dots, relative to `dotSize`. |

## Custom shapes

### What is and isn't supported

**In 0.1.0 you can't add your own shape to the engine.** `ShapeName` is a closed union (`'burst' | 'globe' | 'wave' | 'fan'`). `Shape.name` must be one of those four names. `DotMorphEngine` creates its four shapes itself, in its constructor, and there is no API to register, replace or remove one.

`Shape` is exported for two reasons:

- It is the base class behind `engine.shapes.*`, so it types `params`, `defaults`, `setParams()`, `presence` and `group` (see [Working with shapes](#working-with-shapes)).
- It is the starting point for writing a new shape in a fork of the library, or for contributing one (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

The rest of this section describes the contract every shape follows, and the changes needed to wire a new shape into the engine in a fork.

### Anatomy of a shape

A shape extends `Shape<P>`, where `P` is its params interface:

- `readonly name`: its name, for example `'ring' as const`.
- `protected readonly structuralKeys`: the params that `build()` reads. Changing one of these rebuilds the shape.
- A constructor that calls `super(DEFAULTS, params)` and registers one uniform per live param in `this.local`, which already holds `uPresence`.
- `protected build()`: create the geometries and materials and add the meshes to `this.group`. It runs when the engine attaches the shape, and again on every rebuild, after the old meshes have been disposed.
- `protected syncUniforms()`: copy the live params into the `this.local` uniforms. It runs after `build()` and on every `setParams()` that doesn't rebuild.
- Optionally, `update(time, delta)`: per-frame CPU work, with `time` in seconds of animation time. It runs only while the shape's presence is above 0. None of the built-in shapes need it.

Protected helpers:

| helper | description |
| --- | --- |
| `this.dotMaterial(declarations, body)` | A `ShaderMaterial` for a `Points` mesh, built from the dot template below. |
| `this.lineMaterial(declarations, body)` | A `ShaderMaterial` for a `LineSegments` mesh, built from the line template below. |
| `this.addCloud(geometry, count, seedOffset)` | Adds `aCloud` (the dot's slot in the cloud) and `aSeed` (a random number from 0 to 1) to a dot geometry. Use a `seedOffset` the other shapes don't use. The built-in shapes use 101, 211, 303 and 409. |
| `this.local` | The shape's own uniforms, including `uPresence`. |
| `this.shared` | The engine's shared uniforms. Throws before the shape is attached. |
| `this.ctx` | `{ shared, cloud }`, set when the engine attaches the shape. |
| `this.clear()` | Disposes and removes everything in `this.group`. |

Both materials are transparent, use normal blending, and have depth test and depth write off. Their uniforms are `{ ...shared, ...local }`. The uniform objects are shared by reference, so setting `this.local.uFoo.value` updates every material at once. Don't reuse a shared uniform's name for a local one.

### The GLSL contract

The dot body must define:

```glsl
vec3 dmShapeDot(out float alpha, out float scale)
```

Return the dot's place in the shape, in model space and world units, computed from your attributes and uniforms. Both `alpha` (multiplies opacity) and `scale` (multiplies size) start at 1.0. The template takes care of the rest: the flight between the cloud slot and your target, the pointer push, the point size, the fade in the cloud and the colour ramp.

The line body must define:

```glsl
vec3 dmShapeLine(out float alpha)
```

Return the vertex position. `alpha` starts at 1.0. Lines don't fly through the cloud. The template reveals them from `aAlong` 0 to 1 as presence rises above `lineStart`, and pushes them away from the pointer in proportion to `aAlong`.

`declarations` is inserted before the body. Put your uniforms, attributes and helper functions there. You can pass the same string to both materials when every attribute it declares exists on both geometries. If you want a dot to look different while it is in flight, read `dmProgress(uPresence, aSeed)`: 0 is in the cloud, 1 is landed. The globe uses this to apply its back-side fade only to landed dots.

Attributes:

| attribute | on | provided by |
| --- | --- | --- |
| `position` (`vec3`) | dots and lines | You. three.js takes the vertex count from it, so always set it. Fill it with zeros if the shader computes positions (burst, globe and wave do this), or store real positions in it (the fan does). |
| `aCloud` (`vec3`) | dots | `addCloud()` |
| `aSeed` (`float`, 0 to 1) | dots and lines | `addCloud()` for dots. You set it for lines. The built-in shapes copy each dot's seed to its line. |
| `aAlong` (`float`, 0 to 1) | lines | You: 0 at the anchor, 1 at the tip. |

Uniforms available to both templates:

| uniform | type | value |
| --- | --- | --- |
| `uTime` | `float` | Animation time in seconds. It stands still while motion is off. |
| `uPresence` | `float` | This shape's presence. |
| `uResolution` | `vec2` | Drawing buffer size in device pixels. |
| `uPixelRatio` | `float` | Pixel ratio times the canvas-height factor used for dot sizes. |
| `uDotSize`, `uStagger`, `uSwoop`, `uCloudSpin`, `uCloudDotScale`, `uCloudOpacity`, `uLineStart` | `float` | The engine settings of the same name (`stagger` and `lineStart` clamped). |
| `uCloudCenter` | `vec3` | `cloudCenter`. |
| `uPointer` | `vec2` | Pointer position in normalized device coordinates. |
| `uPointerStrength` | `float` | Current push strength. It is 0 when `interactive` is off, and fades towards 0 while the pointer is idle. |
| `uPointerRadius` | `float` | `pointerRadius`. |
| `uColorTop`, `uColorBottom` | `vec3` | Palette colours. |
| `uRampEnd` | `float` | Palette `rampEnd`. |

three.js also provides its usual built-ins, such as `modelMatrix`, `modelViewMatrix`, `projectionMatrix`, `viewMatrix` and `cameraPosition`. The materials compile as GLSL ES 3.00 through three.js, which maps the `attribute` and `varying` keywords.

GLSL helpers available in both templates:

| helper | description |
| --- | --- |
| `DM_TAU` | 2π. |
| `uint dmMix(uint x)` | Integer bit mixer behind the hashes. |
| `float dmHash(float n)` | Random number from 0 to 1, stable across GPUs. |
| `float dmHash2(vec2 p)` | Random number from 0 to 1 for a 2D point. |
| `float dmNoise(vec2 p)` | Smooth value noise from −1 to 1. |
| `float dmSmoother(float t)` | Smootherstep ease, with `t` clamped to 0 to 1. |
| `mat2 dmRotate(float a)` | 2D rotation matrix. |
| `float dmProgress(float presence, float seed)` | A dot's own flight progress, with stagger applied. |
| `vec3 dmCloud(vec3 slot, float seed)` | Where a cloud slot is right now, turning and breathing. |
| `vec3 dmFlight(vec3 cloud, vec3 target, float k, float seed)` | The curved flight between the cloud and the target. |
| `vec2 dmRepel(vec4 viewPosition, float amount)` | The pointer push, in view space. |
| `float dmScreenHeight(vec4 clip)` | Height on the canvas: 0 at the bottom edge, 1 at the top. |

The templates use the varyings `vAlpha`, `vHeight`, `vAlong` and `vReveal`, and the `dm` prefix for their own names. Give your functions a prefix of their own. The built-in shapes use `burst`, `globe`, `wave` and `fan`.

### Example: a ring shape, in a fork

A minimal shape: dots on a turning ring, each joined to the centre by a spoke. The spokes draw out from the centre as the shape forms. This file would live at `packages/dotmorph/src/shapes/ring.ts` in a fork.

```ts
// src/shapes/ring.ts
import { BufferGeometry, Float32BufferAttribute, LineSegments, Points } from 'three';
import { Shape } from '../core/Shape';

export interface RingParams {
  /** Number of dots (and spokes). Structural. */
  count: number;
  /** Radius of the ring in world units. Live. */
  radius: number;
  /** Turn speed in radians per second. Live. */
  spin: number;
  /** Opacity of the spokes. Live. */
  lineOpacity: number;
}

export const RING_DEFAULTS: RingParams = { count: 160, radius: 2.4, spin: 0.2, lineOpacity: 0.3 };

const DECLARATIONS = /* glsl */ `
uniform float uRadius;
uniform float uSpin;
uniform float uLineOpacity;
attribute float aAngle;

vec3 ringPoint() {
  float angle = aAngle + uTime * uSpin;
  return vec3(cos(angle), sin(angle), 0.0) * uRadius;
}
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  alpha = 1.0;
  scale = 1.0;
  return ringPoint();
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  alpha = uLineOpacity;
  return ringPoint() * aAlong; // aAlong 0 at the centre, 1 at the dot
}
`;

export class RingShape extends Shape<RingParams> {
  readonly name = 'ring' as const;
  protected readonly structuralKeys = ['count'] as const;

  constructor(params?: Partial<RingParams>) {
    super(RING_DEFAULTS, params);
    Object.assign(this.local, {
      uRadius: { value: 0 },
      uSpin: { value: 0 },
      uLineOpacity: { value: 0 },
    });
  }

  protected build() {
    const count = Math.max(1, Math.round(this.params.count));
    const angles = new Float32Array(count);
    for (let i = 0; i < count; i++) angles[i] = (i / count) * Math.PI * 2;

    // Dots: the shader computes positions, so `position` only sets the vertex count.
    const dots = new BufferGeometry();
    dots.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    dots.setAttribute('aAngle', new Float32BufferAttribute(angles, 1));
    this.addCloud(dots, count, 503);
    const seeds = dots.getAttribute('aSeed').array as Float32Array;

    // Spokes: two vertices each, aAlong 0 at the centre and 1 at the dot.
    const lineAngles = new Float32Array(count * 2);
    const lineSeeds = new Float32Array(count * 2);
    const along = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      for (let end = 0; end < 2; end++) {
        lineAngles[i * 2 + end] = angles[i];
        lineSeeds[i * 2 + end] = seeds[i];
        along[i * 2 + end] = end;
      }
    }
    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    lines.setAttribute('aAngle', new Float32BufferAttribute(lineAngles, 1));
    lines.setAttribute('aSeed', new Float32BufferAttribute(lineSeeds, 1));
    lines.setAttribute('aAlong', new Float32BufferAttribute(along, 1));

    const lineMesh = new LineSegments(lines, this.lineMaterial(DECLARATIONS, LINE));
    const dotMesh = new Points(dots, this.dotMaterial(DECLARATIONS, DOT));
    for (const mesh of [lineMesh, dotMesh]) mesh.frustumCulled = false;
    this.group.add(lineMesh, dotMesh);
  }

  protected syncUniforms() {
    this.local.uRadius.value = this.params.radius;
    this.local.uSpin.value = this.params.spin;
    this.local.uLineOpacity.value = this.params.lineOpacity;
  }
}
```

Set `frustumCulled = false` on every mesh, as the built-in shapes do. The vertices move in the shader, so three.js can't compute correct bounds for culling.

### Wiring a shape into the engine, in a fork

In `src/core/Shape.ts`, add the name. Its position in the list is its numeric index:

```diff
-export const SHAPE_NAMES = ['burst', 'globe', 'wave', 'fan'] as const;
+export const SHAPE_NAMES = ['burst', 'globe', 'wave', 'fan', 'ring'] as const;
```

In `src/core/Engine.ts`, import the shape, add its params to `ShapeParamsMap`, add it to the `shapes` type, and create it in the constructor:

```diff
 import { FanShape, type FanParams } from '../shapes/fan';
+import { RingShape, type RingParams } from '../shapes/ring';
```

```diff
   fan: FanParams;
+  ring: RingParams;
 }
```

```diff
-  readonly shapes: { burst: BurstShape; globe: GlobeShape; wave: WaveShape; fan: FanShape };
+  readonly shapes: { burst: BurstShape; globe: GlobeShape; wave: WaveShape; fan: FanShape; ring: RingShape };
```

```diff
       fan: new FanShape(shapes.fan),
+      ring: new RingShape(shapes.ring),
     };
```

In `src/index.ts`, export it:

```diff
 export { FanShape, FAN_DEFAULTS, type FanParams } from './shapes/fan';
+export { RingShape, RING_DEFAULTS, type RingParams } from './shapes/ring';
```

After that, `<DotMorph shape="ring" />`, `engine.morphTo('ring')`, `options.shapes.ring` and `engine.shapes.ring.setParams()` all work and type-check. The engine loops over `SHAPE_NAMES` for everything else. The playground's panels in `site/src/playground` list the shapes by hand, so add the new one there too.

## Other exports

From `dotmorph`:

| export | kind | description |
| --- | --- | --- |
| `toShapeName(shape)` | function | `(shape: ShapeName \| number) => ShapeName`. Converts an index (0 to 3) to a name and checks names. Throws a `RangeError` for unknown names, non-integers and out-of-range indices. |
| `SHAPE_NAMES` | constant | `['burst', 'globe', 'wave', 'fan'] as const`. The order sets each shape's index. |
| `ShapeName` | type | `'burst' \| 'globe' \| 'wave' \| 'fan'`. |
| `PALETTES`, `PALETTE_NAMES`, `PaletteName`, `Palette` | constants, types | See [Palettes](#palettes). |
| `paletteBackground`, `resolvePalette` | functions | See [Palettes](#palettes). |
| `ENGINE_DEFAULTS`, `CLOUD_DEFAULTS` | constants | See [Engine settings](#engine-settings) and [Cloud settings](#cloud-settings). |
| `BURST_DEFAULTS`, `GLOBE_DEFAULTS`, `WAVE_DEFAULTS`, `FAN_DEFAULTS` | constants | Each shape's defaults. They are shared objects, so copy them before you change anything. |
| `BurstShape`, `GlobeShape`, `WaveShape`, `FanShape` | classes | The four shapes. The engine creates its own instances. |
| `BurstParams`, `GlobeParams`, `WaveParams`, `FanParams` | types | Each shape's params. |
| `ShapeParamsMap` | type | Maps each shape name to its params type, for example `ShapeParamsMap['globe']` is `GlobeParams`. |
| `EngineOptions`, `EngineSettings` | types | See [EngineOptions](#engineoptions) and [Engine settings](#engine-settings). |
| `CloudSettings` | type | See [Cloud settings](#cloud-settings). |
| `Vec3Like` | type | `{ x: number; y: number; z: number }`. |
| `Shape` | abstract class | See [Custom shapes](#custom-shapes). |
| `ShapeHandle` | type | What the engine needs from any shape: `name`, `group`, `presence`, `attach()`, `setPresence()`, `update()`, `rebuild()`, `dispose()`. |
| `ShapeContext` | type | `{ shared, cloud, requestRender? }`, passed to `Shape.attach()`. |
| `SharedUniforms` | type | The uniforms every material shares by reference (`Record<string, IUniform>`). |

From `dotmorph/react`: `DotMorph`, `DotMorphProps`, `usePrefersReducedMotion`, plus re-exports of `DotMorphEngine`, `ShapeName`, `PaletteName` and `Palette`.

## Credits

Made by Shnyar: [X @shnulli](https://x.com/shnulli) · [GitHub @shniii](https://github.com/shniii). Live demo and playground: [dotmorph.shni.me](https://dotmorph.shni.me).
