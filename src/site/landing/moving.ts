// 12 "September in both. October in Gauge.": the Harvest and Forecast import counts, the September shadow run and the
// cutover, with the one-line start in a terminal card (the command and one plain comment, nothing else).
import run from '../run.json'
import { dot, to, nw, check, head } from './parts'

const line = (k: string, v: string) => `<li><span>${k}</span><span>${v}</span></li>`
const importCard = '<div class="card imp"><h3 class="serif-title">Import and shadow run</h3><p class="card-sub">Harvest since 2020&nbsp;· Forecast</p>'
 + `<p class="imp-group">Harvest</p><ul class="imp-rows" role="list">${line('Clients', '31')}${line('Projects', '118')}${line(`Time entries${dot}raw and rounded hours kept apart`, '41,206')}${line('Expenses with receipts', '1,904')}${line('Invoices', '612')}${line('Rate history', check())}</ul>`
 + `<p class="imp-group">Forecast</p><ul class="imp-rows" role="list">${line('People', '22')}${line('Placeholders', '2')}${line('Assignments', '26 weeks')}</ul>`
 + `<div class="agent-line agent-line--row"><p class="agent-name">Agent</p><p>Tom Becker’s 2 Harvest people records merged into 1${dot}Jess approved ${nw('Sun Aug 30')}</p></div>`
 + `<div class="shadow"><p class="shadow-title">Shadow run&nbsp;· September</p><ul class="imp-rows" role="list">${line('Invoices', '14 = 14')}${line(`${nw('$238,410.00')} = ${nw('$238,410.00')}`, check())}</ul></div>`
 + `<p class="imp-group">Cutover&nbsp;· ${nw('Thu Oct 1, 12:00 am PT')}</p><ul class="imp-rows imp-rows--plain" role="list"><li><span>9 open invoices adopted${dot}incl. 1039${dot}${nw('$14,250.00')}</span></li><li><span>Numbering${dot}Harvest 1043${to}Gauge 1044</span></li></ul>`
 + '<p class="imp-also">Also moves in from Kantata, Scoro, Teamwork.com, Productive, Rocketlane and Float</p></div>'

const terminal = `<figure class="term"><div class="term-dots" aria-hidden="true"><i></i><i></i><i></i></div><pre aria-label="Start Gauge on your computer"><code><span class="term-prompt" aria-hidden="true">$ </span>${nw(run.clone.slice(0, run.clone.lastIndexOf(' ')))} ${nw(run.clone.slice(run.clone.lastIndexOf(' ') + 1))}\n<span class="term-comment"># clones, installs and starts Gauge on your computer</span></code></pre></figure>`

export function movingSection() {
 return `<section class="band band--pale" aria-labelledby="moving-title"><div class="wrap moving-grid"><div class="moving-copy">${head('moving-title', 'Moving in&nbsp;· Tue Sep 1 – Thu Oct 1', 'September in both. October in Gauge.', 'Gauge read six years of Harvest and the Forecast schedule, ran September beside them to the cent, and took over on October 1. Open invoices came along.')}${terminal}</div>${importCard}</div></section>`
}
