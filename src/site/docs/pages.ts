// The docs index (/docs) and each guide (/docs/<slug>), in the homepage's look: the same header and footer, deep
// turquoise eyebrows, heavy serif titles, white hairline cards and ink code cards with a Copy button.
import { siteDocument, siteHeader, siteFooter, escape as e, type SiteLinks } from '../shell/frame'
import { manifest, docsPages, render, type DocsPage } from './render'

export { docsPages }
// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.d-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.d-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"

function nav(current?: string) {
 return `<nav class="d-nav" aria-label="Docs"><details class="d-menu" open><summary>Docs menu</summary>${manifest.sections.map(section => `<h2>${e(section.title)}</h2><ul>${section.pages.map(p => `<li><a href="/docs/${p.slug}"${p.slug === current ? ' aria-current="page"' : ''}>${e(p.title)}</a></li>`).join('')}</ul>`).join('')}</details></nav>`
}

export function docsIndexHtml(links: SiteLinks, styles: string[]) {
 const body = `${siteHeader(links)}<main class="d-shell"><div class="d-intro"><p class="eyebrow">Docs</p><h1 class="d-title">Gauge docs</h1><p class="d-lede">Run Gauge on your own computer, set up your engagements, and run each week from time to billing.</p></div>`
  + manifest.sections.map(section => `<section class="d-group" aria-labelledby="g-${section.title.toLowerCase().replace(/[^a-z]+/g, '-')}"><h2 id="g-${section.title.toLowerCase().replace(/[^a-z]+/g, '-')}">${e(section.title)}</h2><ul class="d-cards">${section.pages.map(p => `<li><a href="/docs/${p.slug}"><strong>${e(p.title)}</strong><span>${e(p.summary)}</span></a></li>`).join('')}</ul></section>`).join('')
  + `</main>${siteFooter(links)}`
 return siteDocument('Docs · Gauge', 'Guides for running Gauge: getting started, the weekly flows, moving in from Harvest, and backing up and restoring.', styles, body)
}

export function docsArticleHtml(page: DocsPage, links: SiteLinks, styles: string[]) {
 const { html, toc } = render(page), at = docsPages.indexOf(page), previous = docsPages[at - 1], next = docsPages[at + 1]
 const pager = `<nav class="d-pager" aria-label="Previous and next">${previous ? `<a href="/docs/${previous.slug}"><span>Previous</span>${e(previous.title)}</a>` : '<span></span>'}${next ? `<a class="d-next" href="/docs/${next.slug}"><span>Next</span>${e(next.title)}</a>` : ''}</nav>`
 const contents = toc.length > 1 ? `<aside class="d-toc"><h2>On this page</h2><ul>${toc.map(t => `<li><a href="#${t.id}">${e(t.text)}</a></li>`).join('')}</ul></aside>` : '<span></span>'
 const body = `${siteHeader(links)}<main class="d-shell d-shell--article">${nav(page.slug)}<article class="d-article"><p class="eyebrow">${e(page.section)}</p><h1 class="d-title">${e(page.title)}</h1><p class="d-lede">${e(page.summary)}</p><div class="d-prose">${html}</div>${pager}</article>${contents}</main>${siteFooter(links)}`
 return siteDocument(`${page.title} · Gauge docs`, page.summary, styles, body, COPY)
}
