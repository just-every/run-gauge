// The run site `rer build --site` writes: Gauge's homepage with its Run action, /run, /contract, the docs built from
// docs/*.md, the not-found page and the public files they use. Every Run page string and command is in run.json;
// nothing here reads installation data.
import './styles/site.css'
import './styles/landing.css'
import './styles/cards.css'
import './styles/docs.css'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import run from './run.json'
import type { SiteLinks } from './shell/frame'
import { landingHtml } from './landing'
import { docsArticleHtml, docsIndexHtml, docsPages } from './docs/pages'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Base writes dates day first ("17 October 2026"); this US site writes them "Oct 17, 2026". */
const usDate = new RegExp(`\\b(\\d{1,2}) (${months.join('|')}) (\\d{4})\\b`, 'g')

/** Base's shared pages, in the site's US date format, keep a command's repository, folder and pipe from breaking
 * mid-token. */
const inSiteStyle = (html: string) => html
 .replace(usDate, (_, day: string, month: string, year: string) => `${month.slice(0, 3)}\u00a0${day}, ${year}`)
 .replace(/<code>([^<]*)<\/code>/g, (_, text: string) => `<code>${text.replace(/[^\s]*run-gauge\b/g, token => `<span class="nw">${token}</span>`).replace(/(\S+ \| sh)\b/g, '<span class="nw">$1</span>')}</code>`)

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
 const data: RunData = run
 const links: SiteLinks = { repository: run.repository, licence: `${run.repository}/blob/main/LICENSE`, demo: 'https://demo.run-gauge.com/', contract: Boolean(contract) }
 return {
  pages: [
   { path: '/', html: landingHtml(links, styles) },
   { path: '/run', html: inSiteStyle(runPageHtml(identity, data, contract)) },
   ...(contract ? [{ path: '/contract', html: inSiteStyle(contractPageHtml(identity, data, contract)) }] : []),
   { path: '/docs', html: docsIndexHtml(links, styles) },
   ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: docsArticleHtml(page, links, styles) })),
   { path: '/404', html: inSiteStyle(siteNotFoundHtml(identity, data, contract)) },
  ],
  assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'favicon-32.svg', 'apple-touch-icon.png'],
 }
}
