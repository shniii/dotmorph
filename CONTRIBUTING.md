# Contributing to dotmorph

Thanks for helping out. Bug reports, fixes, docs, new palettes and ideas are
all welcome.

## Project layout

The repository is an npm workspace:

| path | what |
| --- | --- |
| `packages/dotmorph` | the library published to npm (`dotmorph`, `dotmorph/react`) |
| `site` | the landing page and playground at [dotmorph.shni.me](https://dotmorph.shni.me) |
| `docs` | [API reference](docs/API.md) and [recipes](docs/RECIPES.md) |

Inside the library, `src/core/Engine.ts` is the engine and `src/core/Shape.ts`
the base class every shape extends. The shared GLSL (the morph, the cloud, the
colour ramp, the dot and line templates) is in `src/core/glsl.ts`, and the four
shapes are in `src/shapes/`: `burst.ts`, `globe.ts`, `wave.ts` and `fan.ts`.

## Setup

Use Node 24 (see `.nvmrc`) and npm 11 or newer.

```bash
npm install
npm run dev        # site with the library aliased to its sources (hot reload)
npm run typecheck
npm run build      # library (ESM + .d.ts), then the site
npm run release:check
```

`npm run release:check` type-checks, builds the library, lints the package with
[publint](https://publint.dev) and prints exactly which files npm would publish.

## Guidelines

- **Calm by default.** Defaults should look good in a hero section without any
  tuning: smooth, never flickering, and readable on every palette. Put bolder
  looks behind parameters.
- **Every tunable is a parameter.** Add it to the shape's `*Params`
  interface and `*_DEFAULTS` object with a doc comment, and say whether it is live
  (uniform or per frame) or structural (rebuilds geometry). The playground
  generates its controls from these objects.
- **Type-check clean.** `strict`, no unused locals, and no parameter properties,
  enums or namespaces, because the build uses `erasableSyntaxOnly`.
- **No runtime dependencies.** `three` and `react` stay peer dependencies, and
  the library must not bundle them.
- **Update the docs** (`docs/API.md`, the package README) and add a line to
  `CHANGELOG.md` under an "Unreleased" heading.

Open an issue before large changes so we can agree on the approach.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change, then run `npm run typecheck` and `npm run build`.
3. If it changes what renders, include a screenshot or short clip from the
   playground (`npm run dev`).
4. Open the pull request and fill in the template.

## Releasing (maintainer)

1. Bump `version` in `packages/dotmorph/package.json` and move the
   "Unreleased" notes in `CHANGELOG.md` under the new version.
2. Commit, then publish a GitHub release tagged `vX.Y.Z`.
3. The Release workflow type-checks, builds, lints and publishes to npm with
   trusted publishing and provenance. No npm token is needed. This needs a
   one-time setup on npmjs.com: package settings -> Trusted publishing ->
   GitHub Actions, repository `shniii/dotmorph`, workflow `release.yml`,
   environment `npm`. Until then, publish from your own machine with
   `npm publish -w dotmorph --access public`.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
