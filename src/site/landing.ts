// Gauge's homepage on the run site (run-gauge.com): its sections' copy and order.
// Its main action is Run Gauge, which opens /run. It links no instance-only route.
import { sheet } from '../gauge/ui-art'
import { siteDocument, siteHeader, siteFooter, type SiteLinks } from './frame'
import { drawings, heroDrawing } from './drawings'

export const title = 'Gauge: finish every week ready to bill'
export const description = 'Approve your team’s time, see next month’s capacity, and hand your bookkeeper one clean billing packet.'

const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const actions = (variant = '', demo = false) => `<div class="s-actions${variant}"><a class="s-run" href="/run">Run Gauge${ARROW}</a>${demo ? `<a class="s-run" href="https://demo.run-gauge.com/">Try the demo${ARROW}</a>` : ''}<a class="s-docs" href="/docs">Read the docs</a></div><p class="s-small">Free and open source, MIT licensed.</p>`

const sections = [
 { id: 'free', eyebrow: 'FREE', heading: '100% free. Yours to run.', body: 'Run it on your own computer, keep every record, and export it all whenever you like.' },
 { id: 'agents', eyebrow: 'AGENTS', heading: 'Your agent prepares. You approve.', body: 'An agent you already run drafts time, staffing and billing packets from cited evidence, and the right person approves each one.' },
 { id: 'capacity', eyebrow: 'CAPACITY', heading: 'See next month before it starts.', body: 'Calendars, leave and staffing show each person’s remaining time, and flag any conflicts.' },
 { id: 'billing', eyebrow: 'BILLING', heading: 'Bill each hour once.', body: 'A packet reserves its exact sources, and an approved packet downloads the same CSV every time.' },
 { id: 'rates', eyebrow: 'RATES', heading: 'Change rates. Keep the past.', body: 'Rates take effect on a date, and approved work keeps the rate it was approved at.' },
 { id: 'move-in', eyebrow: 'MOVE IN', heading: 'Try it beside Harvest.', body: 'Preview your Harvest export without changing anything, compare the totals, and keep Harvest until you’re sure.' },
]

const icon = (paths: string) => `<svg class="s-icon" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`
const included = [
 { title: 'Fixed-fee milestones', body: 'Approve each delivered milestone.', icon: icon('<path d="M10 5h20v30H10z"/><path d="M15 12h10M15 18h10M15 24h5"/><circle cx="15" cy="30" r="1.6"/>') },
 { title: 'Change orders', body: 'Each one is a new version beside the terms.', icon: icon('<path d="M13 9h14l5 5v21H13z"/><path d="M27 9v5h5"/><path d="M8 6h14M8 6v24"/><path d="M18 20h9M18 25h9"/>') },
 { title: 'Expenses', body: 'Receipts stay private to their owner and finance.', icon: icon('<path d="M10 4l3 2 3-2 3 2 3-2 3 2 3-2 2 2v28l-2 2-3-2-3 2-3-2-3 2-3-2-3 2-2-2V6z"/><path d="M15 14h10M15 20h10M15 26h6"/>') },
 { title: 'Timer', body: 'A persistent timer that keeps running.', icon: icon('<circle cx="20" cy="23" r="12"/><path d="M17 5h6M20 5v6M20 23l5-5"/>') },
 { title: 'Roles', body: 'Staff, leads and finance each see their own part.', icon: icon('<circle cx="20" cy="12" r="4.5"/><circle cx="9" cy="16" r="3.5"/><circle cx="31" cy="16" r="3.5"/><path d="M12 33c0-5 3.5-9 8-9s8 4 8 9M3 31c0-4 2.5-7 6-7M37 31c0-4-2.5-7-6-7"/>') },
 { title: 'Export everything', body: 'Every record, history and receipt, in one archive.', icon: icon('<path d="M6 10h28v6H6zM8 16h24v18H8z"/><path d="M16 22h8"/>') },
]

export function landingHtml(links: SiteLinks, styles: string[]) {
 const hero = `<section class="s-hero"><h1>Finish every week ready to bill.</h1><p class="s-sub">${description}</p><p class="s-alt">100% free, open source alternative to <strong>Harvest</strong>, <strong>Productive</strong> and <strong>Scoro</strong></p>${actions('', true)}</section><div class="s-hero-art">${heroDrawing()}</div>`
 const body = sections.map((s, n) => `<section class="s-feature${n % 2 ? ' s-feature--flip' : ''}" id="${s.id}" aria-labelledby="${s.id}-title"><div class="s-copy"><p class="s-eyebrow">${s.eyebrow}</p><h2 id="${s.id}-title">${s.heading}</h2><p>${s.body}</p></div><div class="s-art">${drawings[s.id]()}</div></section>`).join('')
 const also = `<section class="s-also" aria-labelledby="also-title"><h2 id="also-title">Also included</h2><ul>${included.map(x => `<li>${x.icon}<div><h3>${x.title}</h3><p>${x.body}</p></div></li>`).join('')}</ul></section>`
 const closing = `<section class="s-close" aria-labelledby="close-title">${sheet(`<h2 id="close-title">Your week, in order.</h2><p class="s-close-line">Agency operations you run yourself.</p>${actions(' s-actions--light')}`, 's-close-sheet')}</section>`
 return siteDocument(title, description, styles, `${siteHeader(links)}<main class="s-main">${hero}${body}${also}${closing}</main>${siteFooter(links)}`)
}
