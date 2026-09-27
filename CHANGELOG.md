# Changelog

All notable changes to `dotmorph` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Hover replaces the old pointer push. Each shape now answers a hovering
  mouse or pen in its own way. Touch never drives hover, so a tap can't
  leave a dent.
  - The burst and the wave part around the pointer on springs. The clearing
    holds while the pointer rests. The tips spring back when it moves on or
    leaves.
    - Burst: tips are pushed away from the pointer. Tips that lie past the
      pointer along their ray are also pushed outward along it, more the
      farther past they are. This leaves a clearing of about a tenth of the
      canvas height. Each tip's damping follows how hard it is pushed right
      now, from `hoverRelease` (no push) up to `hoverDamping` (full push), so a
      held clearing settles calmly and released tips wobble back.
    - Wave: distances are measured on the canvas in canvas heights, so the
      reach is round on screen and the same for near and far stems. The push
      fades on a smooth bell. Stems are stiffer against leaning than against
      stretching, so tops mostly stretch or squash.
  - The globe and the fan swirl counter-clockwise around the pointer while it
    moves. The swirl fades by itself once the pointer stops. About a fifth of
    a second of movement fills it, it drains with a half-life of about 0.7 s,
    and its centre trails a sweep by a little over a fifth of a second. It is a
    smooth vortex measured on the canvas around its centre, in canvas heights.
    - Globe: an arc's hover fades in once its head has run a little way out and
      out before its tail catches up.
    - Fan: every point of a strand feels the swirl at its own place, with a
      share that rises smoothly from nothing at the waist to all of it at either
      column, so hovering a wing moves that part of the wing.
- New live params tune each shape's hover:
  - burst: `hoverReach` (0.37), `hoverPush` (1.3), `hoverBreathe` (0.6),
    `hoverPeriod` (0.55), `hoverDamping` (0.8) and `hoverRelease` (0.3);
  - globe: `hoverReach` (0.25) and `hoverSize` (0.034), in canvas heights;
  - wave: `hoverReach` (0.15) and `hoverDent` (0.06), in canvas heights,
    `hoverLean` (0.65), `hoverPeriod` (0.55) and `hoverDamping` (0.3);
  - fan: `hoverReach` (0.2) and `hoverSize` (0.05), in canvas heights.
- `pointerStrength` now scales every shape's hover without changing how it
  moves. `pointerRadius` now scales each built-in shape's own reach, relative
  to its default of 0.32. For custom shapes that use `dmRepel`, it is still the
  radius itself.
- New `engine.hoverPaused` pauses hover on its own while the animation keeps
  running. `DotMorph` sets it while less than half of the canvas shows.
- Hover freezes while motion is off, and pointer moves made meanwhile don't
  build up a swirl. Turning `interactive` off puts every shape back at rest at
  once.
- Nothing moves before the pointer first enters the canvas. A shape that comes
  back after a morph is handed the pointer's current position, or told that it
  has left, so it never holds a dent where nobody points.
- `engine.scene` is now typed as a plain `Scene`, so the published types work
  with every `@types/three` in the peer range.
- The site and the development setup now use three.js r186 and TypeScript 7.
  three.js r184 and newer need Safari 16.4+, Chrome 94+ and Firefox 93+.
- For shape authors: `Shape` gains the `ownsHover` flag and the hover hooks
  `pointerMove`, `pointerLeave`, `updateHover` and `resetHover`.
  `ShapeContext` gains `camera`. The shader templates gain the `uHoverGain`
  and `uHoverReach` uniforms and the `dmViewToModel` and `dmSwirl`
  helpers.

## [0.1.0] - Unreleased

First public release. Set the date when it is published.

### Added

- `DotMorphEngine`, the framework-agnostic engine: one three.js renderer and
  camera shared by four shapes that morph into each other through a turning
  dot cloud, with tunable length, stagger and swoop.
- Four shapes, `BurstShape`, `GlobeShape`, `WaveShape` and `FanShape`, each
  with typed, live-tunable parameters (`*_DEFAULTS`, `setParams`), built
  on the exported `Shape` base class.
- `dotmorph/react`: the `<DotMorph>` component and the `usePrefersReducedMotion`
  hook. It ships with `'use client'` for Next.js App Router, follows
  `prefers-reduced-motion` by default, pauses off screen, and supports
  `fallback` / `onError` when WebGL 2 is unavailable.
- Six palettes (`aurora`, `ocean`, `ember`, `mint`, `rose`, `midnight`) with
  matching CSS backgrounds, smooth palette fades, and custom `{ top, bottom }`
  palettes.
- Pointer interaction that pushes dots and lines aside.

[Unreleased]: https://github.com/shniii/dotmorph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/shniii/dotmorph/releases/tag/v0.1.0
