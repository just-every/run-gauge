// The two painted scenes: 11, Cascade Cider's taproom on launch day (no heading), and 13, the closing over the
// Willamette promenade with the footer set in type. Both are clean plates; their tags and copy are HTML.
import { runButton } from '../shell/frame'
import { dot, nw, check } from './parts'

const picture = (name: string, alt: string, phone: number) => `<picture class="scene-art"><source type="image/avif" media="(max-width: 759px)" srcset="/site/${name}-phone-640.avif 640w, /site/${name}-phone-${phone}.avif ${phone}w" sizes="100vw">`
 + `<source type="image/webp" media="(max-width: 759px)" srcset="/site/${name}-phone-640.webp 640w, /site/${name}-phone-${phone}.webp ${phone}w" sizes="100vw">`
 + `<source type="image/avif" srcset="/site/${name}-768.avif 768w, /site/${name}-1152.avif 1152w, /site/${name}-1536.avif 1536w" sizes="100vw">`
 + `<img src="/site/${name}-1536.webp" srcset="/site/${name}-768.webp 768w, /site/${name}-1152.webp 1152w, /site/${name}-1536.webp 1536w" sizes="100vw" width="1536" height="1024" alt="${alt}" loading="lazy" decoding="async"></picture>`

export function interlude() {
 return '<section class="scene scene--taproom" aria-label="Fri Nov 13 at Cascade Cider">'
  + picture('interlude', 'Cascade Cider’s taproom in Hood River at midday: customers at the bar, new cans on the shelf, the Columbia Gorge in November through tall windows, and one person holding up a phone showing the new site.', 660)
  + `<p class="tag tag--taproom"><span class="hc-dot" aria-hidden="true"></span><span>${nw('Fri Nov 13')}${dot}Cascade Cider${dot}${nw(`new site live on its date ${check()}`)}</span></p></section>`
}

export function closing() {
 return '<section class="scene scene--closing" aria-labelledby="closing-title">'
  + picture('closing', 'Two studio people walk with coffee along the west-bank promenade on the Willamette at 3:30 pm, looking east to Mount Hood under a clear November sky.', 720)
  + `<div class="closing-copy"><h2 class="display" id="closing-title">Friday launch, invoice paid.</h2><p class="closing-sub">100% free and open source. MIT licensed.</p><div class="closing-actions">${runButton}<a class="text-link" href="/docs">Read the docs</a></div></div>`
  + `<p class="tag tag--closing"><span class="hc-dot" aria-hidden="true"></span><span>${nw('Fri Nov 20')}${dot}Pacific Trail live${dot}Cascade Cider paid in full${dot}${nw(`$86,400 of $86,400 ${check()}`)}</span></p></section>`
}
