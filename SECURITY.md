# Security policy

## Supported versions

Security fixes land in the latest minor release of `dotmorph`.

| version | supported |
| --- | --- |
| 0.1.x | yes |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub:
[**Report a vulnerability**](https://github.com/shniii/dotmorph/security/advisories/new)
(repository → Security → Advisories → Report a vulnerability).

Include what you found, how to reproduce it, and the impact you expect. You
should get a first reply within a few days. Once a fix is released, the
advisory is published with credit to you unless you prefer otherwise.

## How releases are protected

- The first release, 0.1.0, was published by the maintainer from their own
  machine with two-factor authentication, because npm only allows trusted
  publishing for a package that already exists. It has no provenance statement.
- From 0.1.1 on, releases are published from GitHub Actions with
  [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OpenID
  Connect), so no long-lived npm token exists in the repository or its settings.
  The publish job runs in a protected `npm` environment with install scripts
  disabled.
- Those releases carry an npm
  [provenance statement](https://docs.npmjs.com/generating-provenance-statements)
  that links the tarball to the exact commit and workflow run. You can check it
  with `npm audit signatures`.
- The package has no runtime dependencies. `three` and `react` are peer
  dependencies you install and control.
- Third-party GitHub Actions are pinned to full commit hashes, and workflows run
  with read-only permissions by default.
