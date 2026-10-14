// The run site's document, header and footer, shared by the homepage and the docs. Static HTML; no script.
import { artDefs, lockup } from '../gauge/ui-art'
export { escape } from '../gauge/ui-forms'
import { escape as e } from '../gauge/ui-forms'

export interface SiteLinks { repository: string; licence: string }

/** One page: Gauge's fonts, theme tokens and drawing parts from the public folder, then the site's compiled stylesheet. */
export function siteDocument(title: string, description: string, styles: string[], body: string) {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}">`
  + `<link rel="icon" href="/brand/mark.svg"><link rel="preload" href="/fonts/mona-sans/mona-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/cyanotype.css">`
  + `${styles.map(href => `<link rel="stylesheet" href="${e(href)}">`).join('')}</head><body class="s-page">${artDefs}${body}</body></html>`
}

export const siteHeader = (links: SiteLinks) => `<header class="s-bar">${lockup('/', 'Gauge')}<nav aria-label="Site"><a href="/docs">Docs</a><a href="${e(links.repository)}">Source</a></nav></header>`

export const siteFooter = (links: SiteLinks) => `<footer class="s-foot"><div class="s-foot-brand">${lockup('/', 'Gauge')}<p>Agency operations you run yourself.</p></div><nav aria-label="Footer"><a href="/docs">Docs</a><a href="${e(links.repository)}">Source</a><a href="${e(links.licence)}">MIT licensed</a></nav></footer>`
