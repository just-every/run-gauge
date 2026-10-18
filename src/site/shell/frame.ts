// The run site's document, header and footer, shared by the homepage and the docs. Static HTML; the only script is
// the docs' Copy button. Icons are Base's frozen head of the hand-tuned favicons; the share image is the hero with the headline set in type.
import { iconHead } from '../../base/icon-head'
import { identity } from '../../identity'

export const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export interface SiteLinks { repository: string; licence: string; demo: string; contract: boolean }

const share = `${identity.runSite}/site/share.jpg`

/** One page: Gauge's fonts and tokens from the public folder, then the site's compiled stylesheets. */
export function siteDocument(title: string, description: string, styles: string[], body: string, script = '') {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}">`
  + `<meta name="theme-color" content="#ffffff"><meta property="og:type" content="website"><meta property="og:site_name" content="Gauge"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">`
  + `<meta property="og:image" content="${share}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">${iconHead}`
  + '<link rel="preload" href="/fonts/source-serif-4/source-serif-4-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="preload" href="/fonts/mona-sans/mona-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">'
  + `<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="${identity.theme}">${styles.map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('')}</head>`
  + `<body class="site">${body}${script ? `<script>${script}</script>` : ''}</body></html>`
}

/** The mark and the serif wordmark. */
export const lockup = (size = 34) => `<a class="lockup" href="/"><img src="/brand/mark.svg" alt="" width="${size}" height="${size}"><span>Gauge</span></a>`

const nav = (links: SiteLinks) => `<a href="/docs">Docs</a>${links.contract ? '<a href="/contract">Contract</a>' : ''}<a href="${escape(links.repository)}">Source</a>`

/** The header: `hero` sets the lockup on a white tab over the painting, as the approved hero draws it. */
export const siteHeader = (links: SiteLinks, variant: 'hero' | 'page' = 'page') => `<header class="bar bar--${variant}">${lockup()}<nav aria-label="Site">${nav(links)}</nav></header>`

export const siteFooter = (links: SiteLinks) => `<footer class="foot"><div class="foot-in"><div class="foot-brand">${lockup(28)}<p>Free, open source agency management</p></div>`
 + `<nav aria-label="Footer"><a href="/docs">Docs</a>${links.contract ? '<a href="/contract">Contract</a>' : ''}<a href="${escape(links.repository)}">Source</a><a href="${escape(links.licence)}">MIT licensed</a></nav></div></footer>`

/** "Run Gauge →" (to /run), "Try the demo" and "Read the docs". */
export const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
export const runButton = '<a class="run" href="/run">Run Gauge' + ARROW + '</a>'
