# Changelog

All notable changes to `dotmorph` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/shniii/dotmorph/releases/tag/v0.1.0
