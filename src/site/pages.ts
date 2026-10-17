// The run site `rer build --site` writes: Gauge's homepage with its Run action, /run, the docs built from docs/*.md,
// the not-found page and the public files they use. Every Run page string and command is in run.json; nothing here
// reads installation data.
import './site.css'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import run from './run.json'
import { landingHtml } from './landing'
import { docsArticleHtml, docsIndexHtml, docsPages } from './docs'

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
 const data: RunData = run, links = { repository: run.repository, licence: `${run.repository}/blob/main/LICENSE` }
 return {
  pages: [
   { path: '/', html: landingHtml(links, styles) },
   { path: '/run', html: runPageHtml(identity, data, contract) },
   ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, data, contract) }] : []),
   { path: '/docs', html: docsIndexHtml(links, styles) },
   ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: docsArticleHtml(page, links, styles) })),
   { path: '/404', html: siteNotFoundHtml(identity, data, contract) },
  ],
  assets: ['rer-theme.css', 'cyanotype.css', 'fonts', 'brand'],
 }
}
