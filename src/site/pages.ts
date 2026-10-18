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
import { iconLinks, type SiteLinks } from './shell/frame'
import { landingHtml } from './landing'
import { docsArticleHtml, docsIndexHtml, docsPages } from './docs/pages'

/** Base's shared pages link the full mark as their icon; the site gives them the pixel-fitted favicons instead. */
const baseIcons = (html: string) => html.replace(`<link rel="icon" href="${identity.mark}">`, iconLinks)

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
 const data: RunData = run
 const links: SiteLinks = { repository: run.repository, licence: `${run.repository}/blob/main/LICENSE`, demo: 'https://demo.run-gauge.com/', contract: Boolean(contract) }
 return {
  pages: [
   { path: '/', html: landingHtml(links, styles) },
   { path: '/run', html: baseIcons(runPageHtml(identity, data, contract)) },
   ...(contract ? [{ path: '/contract', html: baseIcons(contractPageHtml(identity, data, contract)) }] : []),
   { path: '/docs', html: docsIndexHtml(links, styles) },
   ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: docsArticleHtml(page, links, styles) })),
   { path: '/404', html: baseIcons(siteNotFoundHtml(identity, data, contract)) },
  ],
  assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'favicon-32.svg', 'apple-touch-icon.png'],
 }
}
