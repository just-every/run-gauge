# Gauge source provenance

Gauge's first implementation began in October 2026 from the Base foundation at
`3d643dda1d203d36e3fa57e8e5ba14e414bba6f9`. On 14 October 2026 it moved to Base
`79f61faef682f9d6cdb64e843cfbd3cf02887982`: the current foundation was assembled
with Base's own generator, converted to package mode (`@runeditrun/rer` 0.2.4,
no vendored CLI), and Gauge's domain, tests and assets were carried onto it.

- Copied Base source (`src/base`, `src/modules/*`, the Base migrations) is
  recorded byte for byte in `base-copies.json`; `edition.json` and
  `sources.lock.json` declare each component and its origin.
- Applied migrations `0001`–`0007` keep their original bytes (0001 and 0005 at
  their 3d643dd revision). Base's later auth, dependency, owner-claim, erasure
  and import-kit custody schema is appended as `0008`–`0016`; a database built
  from Gauge's chain has exactly the current Base schema for those tables.
- Gauge's domain schema, server policy, workflows, agent proposals, Harvest and
  Forecast mapping, pages, brand mark and tests are edition-owned.

The MIT licence is in LICENSE; the Mona Sans font keeps its SIL Open Font License
under `public/fonts`.
