# Fonts

Mona Sans is self-hosted under the SIL Open Font License 1.1 in
`mona-sans/LICENSE.txt`. The two WOFF2 files are `MonaSansVF[opsz,wght].woff2`
from the Mona Sans 2.0.27 webfonts release (https://github.com/github/mona-sans),
subset with fonttools `pyftsubset` to the Latin and Latin Extended ranges in
`fonts.css`, keeping every layout feature (Gauge sets tabular figures on hours,
money and dates) and both variable axes (weight 200–900, optical size).

The root document links `/fonts/fonts.css` once, outside the temporary dev SSR
stylesheet, and preloads only the primary Latin file. Do not import this CSS
from a component. Every body-font stack uses `--font-body`, including the local
`Mona Sans Fallback` before generic fallback fonts; controls inherit it.

Fallback scales use Mona Sans/Arial advance-width ratios over A-Z, a-z and 0-9
at weights 400, 500 and 700 (optical size 16). Ascent, descent and line gap match
Mona Sans's 1090, -320 and 0 per 1000 units, divided by each scale. Matching
metrics reduces layout movement; different glyph designs cannot have identical
widths in every piece of text. Recalculate the fallback and preload when changing
the brand font.
