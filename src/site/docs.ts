/// <reference types="vite/client" />
// The on-site docs (/docs and /docs/<slug>), built from the repository's Markdown in docs/ in the landing's look.
// docs/site.json lists the pages in order, in sections. Markdown renders at build time: raw HTML shows as text,
// headings get GitHub-style ids and the page's h2s become its contents, code blocks become cyanotype code cards, wide
// tables scroll in a focusable region. Every problem (a level-1 heading, an image, a code block without a language,
// a link to a docs page that does not exist) fails the build.
import { Marked } from 'marked'
import { siteDocument, siteHeader, siteFooter, escape as e, type SiteLinks } from './frame'

const files = import.meta.glob('../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
interface Manifest { sections: { title: string; pages: { slug: string; title: string; file: string; summary: string }[] }[] }
// Read through Vite like the pages, so the docs folder is build input only.
const manifest = (import.meta.glob('../../docs/site.json', { import: 'default', eager: true }) as Record<string, Manifest>)['../../docs/site.json']
if (!manifest?.sections?.length) throw new Error('docs/site.json lists no docs sections')
export interface DocsPage { slug: string; title: string; file: string; summary: string; section: string }
export const docsPages: DocsPage[] = manifest.sections.flatMap(section => section.pages.map(page => ({ ...page, section: section.title })))

const decode = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const languages: Record<string, string> = { sh: 'Shell', bash: 'Shell', json: 'JSON', text: 'Text' }
function slugger() {
 const seen = new Map<string, number>()
 return (text: string) => {
  const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
  const count = seen.get(base) ?? 0; seen.set(base, count + 1)
  return count ? `${base}-${count}` : base
 }
}

function render(page: DocsPage) {
 const markdown = files[`../../docs/${page.file}`]
 if (markdown === undefined) throw new Error(`docs/site.json lists docs/${page.file}, which does not exist`)
 const slug = slugger(), toc: { id: string; text: string }[] = [], problems: string[] = []
 const marked = new Marked({
  gfm: true,
  renderer: {
   heading({ tokens, depth }) {
    if (depth === 1) problems.push('has a level-1 heading; the title comes from docs/site.json')
    const text = decode(this.parser.parseInline(tokens, this.parser.textRenderer)).replace(/\s+/g, ' ').trim(), id = slug(text)
    if (depth === 2) toc.push({ id, text })
    return `<h${Math.max(depth, 2)} id="${id}">${this.parser.parseInline(tokens)}</h${Math.max(depth, 2)}>\n`
   },
   code({ text, lang }) {
    const language = (lang ?? '').trim().toLowerCase()
    if (!language) problems.push('has a code block without a language')
    return `<figure class="d-code"><figcaption>${e(languages[language] ?? language)}</figcaption><pre><code>${e(text.replace(/\n$/, ''))}</code></pre></figure>\n`
   },
   html({ text }) { return e(text) },
   link({ href, title, tokens }) {
    if (href.startsWith('/docs/') && !docsPages.some(p => `/docs/${p.slug}` === href.split('#')[0])) problems.push(`links to ${href}, which is not a docs page`)
    return `<a href="${e(href)}"${title ? ` title="${e(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
   },
   image({ href }) { problems.push(`has an image (${href})`); return '' },
  },
 })
 const html = (marked.parse(markdown, { async: false }) as string).replace(/<table>/g, `<div class="d-table" role="region" tabindex="0" aria-label="Table"><table>`).replace(/<\/table>/g, '</table></div>')
 if (problems.length) throw new Error(`docs/${page.file} ${problems.join('; ')}`)
 return { html, toc }
}

function nav(current?: string) {
 return `<nav class="d-nav" aria-label="Docs"><details class="d-menu" open><summary>Docs menu</summary>${manifest.sections.map(section => `<h2>${e(section.title)}</h2><ul>${section.pages.map(p => `<li><a href="/docs/${p.slug}"${p.slug === current ? ' aria-current="page"' : ''}>${e(p.title)}</a></li>`).join('')}</ul>`).join('')}</details></nav>`
}

export function docsIndexHtml(links: SiteLinks, styles: string[]) {
 const body = `${siteHeader(links)}<main class="d-shell"><div class="d-intro"><p class="s-eyebrow">DOCS</p><h1>Gauge docs</h1><p class="d-lede">Run Gauge, set up your engagements and finish every week ready to bill.</p></div>`
  + manifest.sections.map(section => `<section class="d-group"><h2>${e(section.title)}</h2><ul class="d-cards">${section.pages.map(p => `<li><a href="/docs/${p.slug}"><strong>${e(p.title)}</strong><span>${e(p.summary)}</span></a></li>`).join('')}</ul></section>`).join('')
  + `</main>${siteFooter(links)}`
 return siteDocument('Docs · Gauge', 'Guides for running Gauge: getting started, the weekly flows, moving in from Harvest, and backing up and restoring.', styles, body)
}

export function docsArticleHtml(page: DocsPage, links: SiteLinks, styles: string[]) {
 const { html, toc } = render(page), at = docsPages.indexOf(page), previous = docsPages[at - 1], next = docsPages[at + 1]
 const pager = `<nav class="d-pager" aria-label="Previous and next">${previous ? `<a href="/docs/${previous.slug}"><span>Previous</span>${e(previous.title)}</a>` : '<span></span>'}${next ? `<a class="d-next" href="/docs/${next.slug}"><span>Next</span>${e(next.title)}</a>` : ''}</nav>`
 const contents = toc.length > 1 ? `<aside class="d-toc"><h2>On this page</h2><ul>${toc.map(t => `<li><a href="#${t.id}">${e(t.text)}</a></li>`).join('')}</ul></aside>` : ''
 const body = `${siteHeader(links)}<main class="d-shell d-shell--article">${nav(page.slug)}<article class="d-article"><p class="s-eyebrow">${e(page.section.toUpperCase())}</p><h1>${e(page.title)}</h1><p class="d-lede">${e(page.summary)}</p><div class="d-prose">${html}</div>${pager}</article>${contents}</main>${siteFooter(links)}`
 return siteDocument(`${page.title} · Gauge docs`, page.summary, styles, body)
}
