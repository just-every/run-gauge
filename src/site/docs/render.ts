/// <reference types="vite/client" />
// The on-site docs' content: docs/site.json lists the pages in order, in sections, and each page's Markdown renders at
// build time. Raw HTML shows as text, headings get GitHub-style ids and the page's h2s become its contents, code blocks
// become ink code cards, wide tables scroll in a focusable region. Every problem (a level-1 heading, an image, a code
// block without a language, a link to a docs page that does not exist) fails the build.
import { Marked } from 'marked'
import { escape as e } from '../shell/frame'

const files = import.meta.glob('../../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
interface Manifest { sections: { title: string; pages: { slug: string; title: string; file: string; summary: string }[] }[] }
// Read through Vite like the pages, so the docs folder is build input only.
export const manifest = (import.meta.glob('../../../docs/site.json', { import: 'default', eager: true }) as Record<string, Manifest>)['../../../docs/site.json']
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

/** A code card; shell commands wrap before an owner/repository argument, never inside a token. */
const codeCard = (text: string, language: string) => `<figure class="d-code"><figcaption><span>${e(languages[language] ?? language)}</span><button class="d-copy" type="button" hidden>Copy</button></figcaption>`
 + `<pre><code>${e(text).replace(/ (just-every\/)/g, ' <wbr>$1')}</code></pre></figure>\n`

export function render(page: DocsPage) {
 const markdown = files[`../../../docs/${page.file}`]
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
    return codeCard(text.replace(/\n$/, ''), language)
   },
   html({ text }) { return e(text) },
   link({ href, title, tokens }) {
    if (href.startsWith('/docs/') && !docsPages.some(p => `/docs/${p.slug}` === href.split('#')[0])) problems.push(`links to ${href}, which is not a docs page`)
    return `<a href="${e(href)}"${title ? ` title="${e(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
   },
   image({ href }) { problems.push(`has an image (${href})`); return '' },
  },
 })
 const html = (marked.parse(markdown, { async: false }) as string).replace(/<table>/g, '<div class="d-table" role="region" tabindex="0" aria-label="Table"><table>').replace(/<\/table>/g, '</table></div>')
 if (problems.length) throw new Error(`docs/${page.file} ${problems.join('; ')}`)
 return { html, toc }
}
