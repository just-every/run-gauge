// 01 Hero: the approved painting of Northbound Studio's door in the rain (a clean plate; the desk's painted header,
// cards and copy are rebuilt here as HTML at their places), the headline, the alternative line and the three actions.
import { siteHeader, runButton, type SiteLinks } from '../shell/frame'
import { dot, to, nw, check, flag } from './parts'

export const headline = 'Great work, paid in full.'
export const subline = 'Gauge carries each engagement from estimate and retainer through staffing, time and invoices to cash, and plans the recovery when a project drifts.'

const art = '<picture class="hero-art"><source type="image/avif" media="(max-width: 759px)" srcset="/site/hero-phone-640.avif 640w, /site/hero-phone-720.avif 720w" sizes="100vw">'
 + '<source type="image/webp" media="(max-width: 759px)" srcset="/site/hero-phone-640.webp 640w, /site/hero-phone-720.webp 720w" sizes="100vw">'
 + '<source type="image/avif" srcset="/site/hero-640.avif 640w, /site/hero-960.avif 960w" sizes="(min-width: 1100px) 62vw, 100vw">'
 + '<img src="/site/hero-960.webp" srcset="/site/hero-640.webp 640w, /site/hero-960.webp 960w" sizes="(min-width: 1100px) 62vw, 100vw" width="960" height="1024" alt="Northbound Studio’s teal door on a rainy Portland morning: a woman with an umbrella goes in while a designer works behind the window wall of pinned client work." fetchpriority="high"></picture>'

const card = (body: string, icon = '<span class="hc-dot" aria-hidden="true"></span>', extra = '') => `<li class="hc${extra}">${icon}<p>${body}</p></li>`
const cards = '<ul class="hero-cards" aria-label="This week at Northbound Studio">'
 + card(`<b>Maya Chen</b>${dot}32 of 36 hrs${dot}week of ${nw('Mon Oct 19')}`, '<span class="hc-dot hc-dot--soft" aria-hidden="true"></span>')
 + card(`<b>UX designer</b>${dot}20 hrs${to}Priya Patel approved`)
 + card(`Diego Ramos out sick ${nw('Tue–Wed')} ${nw('Oct 20–21')}${to}Tom Becker (1099) takes his 14 hrs${dot}launch still ${nw('Fri Nov 13')} ${check()}`, flag(), ' hc--flag')
 + card(`<b>Nov</b>${dot}2 won HubSpot deals${dot}senior developer placeholder`)
 + card(`<b>Billable utilization 78%</b>${dot}target 75%`)
 + '</ul>'

export function hero(links: SiteLinks) {
 return `<section class="hero" aria-labelledby="hero-title">${siteHeader(links, 'hero')}<div class="hero-paint">${art}${cards}</div>`
  + `<div class="hero-copy"><h1 id="hero-title">Great work, <span class="nw">paid in full.</span></h1><p class="hero-sub">${subline}</p>`
  + '<p class="hero-alt">100% free, open source alternative to <strong>Kantata</strong>, <strong>Harvest</strong> and <strong>Scoro</strong></p>'
  + `<div class="hero-actions">${runButton}<p class="hero-links"><a href="${links.demo}">Try the demo</a><a href="/docs">Read the docs</a></p></div></div></section>`
}
