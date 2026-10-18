// Small drawing parts the homepage's product cards share: separators that never start a line, unbreakable dates and
// ids, client chips in each client's fixed colour, initials, and the few icons the cards use.

/** " · " that stays with the word before it, so no line starts with a separator. */
export const dot = ' · '
/** " → " that stays with the word before it. */
export const to = ' → '
/** Text that never breaks inside: dates, ids, money with units. */
export const nw = (text: string) => `<span class="nw">${text}</span>`

export type Client = 'cascade' | 'pacific' | 'willamette' | 'treasure' | 'capitol' | 'rose' | 'studio'
export const clientName: Record<Client, string> = { cascade: 'Cascade Cider', pacific: 'Pacific Trail', willamette: 'Willamette CU', treasure: 'Treasure Valley', capitol: 'Capitol Grain', rose: 'Rose City Running Co.', studio: 'Studio' }
export const chip = (client: Client, label = clientName[client]) => `<span class="chip chip--${client}">${label}</span>`
/** A round client swatch, as the statement and invoice cards draw it. */
export const swatch = (client: Client) => `<span class="swatch swatch--${client}" aria-hidden="true"></span>`

/** Initials in a tinted circle. */
export const avatar = (initials: string, tone = '') => `<span class="avatar${tone ? ` avatar--${tone}` : ''}" aria-hidden="true">${initials}</span>`

const svg = (body: string, cls: string, box = '0 0 20 20') => `<svg class="${cls}" viewBox="${box}" aria-hidden="true">${body}</svg>`
export const check = (cls = '') => svg('<path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', `i-check${cls ? ` ${cls}` : ''}`)
/** A filled green circle with a white check. */
export const done = () => svg('<circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M5.6 10.4l3 3 5.8-6.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 'i-done')
export const flag = () => svg('<path d="M5 18V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5.5 3.2h10l-2.6 3.7 2.6 3.7h-10z" fill="currentColor"/>', 'i-flag')
export const lock = () => svg('<rect x="4" y="9" width="12" height="9" rx="2" fill="currentColor"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="2"/>', 'i-lock')
export const calendar = () => svg('<rect x="3.5" y="4.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 8.5h13M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>', 'i-line')
export const list = () => svg('<path d="M7 6h9M7 10h9M7 14h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="10" r="1" fill="currentColor"/><circle cx="4" cy="14" r="1" fill="currentColor"/>', 'i-line')
export const people = () => svg('<circle cx="7.5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13.5" cy="7.6" r="2.1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.8 15.5c.6-2.6 2.5-4 4.7-4s4.1 1.4 4.7 4M12.2 11.7c2.1-.4 4.2.8 4.9 3.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>', 'i-line')
export const arrowRight = () => svg('<path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>', 'i-arrow')

/** Dates in running text keep their weekday, month and day together. */
export const dates = (text: string) => text.replace(/\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?(Sep|Oct|Nov|Dec|Jan) (\d{1,2})\b/g, (_, day = '', month, n) => `${day.replace(' ', '\u00a0')}${month}\u00a0${n}`).replace(/ – /g, '\u00a0– ')
/** A section's eyebrow (stage and dates) and its serif heading. */
export const head = (id: string, eyebrow: string, heading: string, lede = '') => `<p class="eyebrow">${dates(eyebrow)}</p><h2 class="display" id="${id}">${heading}</h2>${lede ? `<p class="lede">${dates(lede)}</p>` : ''}`
export const section = (id: string, tone: 'white' | 'pale' | 'navy', content: string, extra = '') => `<section class="band band--${tone}${extra ? ` ${extra}` : ''}" aria-labelledby="${id}"><div class="wrap">${content}</div></section>`
