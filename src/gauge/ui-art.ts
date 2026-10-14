// The cyanotype print: Gauge's drawings are its real cards printed white on a
// deep Prussian-blue sun-print sheet with torn deckled edges, white construction
// lines with corner crosses and a long tick scale along the bottom. The app and
// the run site share these parts; their look is in public/cyanotype.css.
/** Once per page: the deckle filter the sheets tear their edges with, and the tentative hatches. */
export const artDefs = '<svg class="g-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>'
 + '<filter id="g-deckle" x="-4%" y="-8%" width="108%" height="116%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G"/></filter>'
 + '<pattern id="g-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#174F84"/></pattern>'
 + '<pattern id="g-hatch-light" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#fff"/></pattern>'
 + '</defs></svg>'

/** A cyanotype sheet around real content; `scale` adds the long tick scale on its bottom construction line. */
export const sheet = (content: string, className = '', scale = true, label = '') => `<div class="g-sheet${className ? ` ${className}` : ''}"${label ? ` role="img" aria-label="${label}"` : ''}>${content}${scale ? '<span class="g-scale" aria-hidden="true"></span>' : ''}</div>`

/** The brand lockup: the ink half-disc mark with three ticks, and the name. */
export const lockup = (href: string, name: string) => `<a class="g-brand" href="${href}"><img src="/brand/mark.svg" alt="" width="38" height="20"><span>${name}</span></a>`
