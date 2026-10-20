import type { Value } from './model'
import { escape as e } from './ui-forms'
import { hours, money } from './ui-format'

export function harvestControls(preview: Value) {
 const controls = Object.entries(preview.timeControls ?? {}) as [string, Value][]
 if (!controls.length) return ''
 return `<h3>Source time controls</h3><p>Raw time and exported billing rounding stay separate. Unknown source quantities remain unknown; approval and lock flags do not grant native approval.</p><div class="g-table"><table><thead><tr><th scope="col">Client / month</th><th scope="col">Raw time</th><th scope="col">Rounded billing time</th><th scope="col">Already billed raw time</th><th scope="col">Unbilled raw time</th><th scope="col">Source cost</th><th scope="col">Source billable value</th></tr></thead><tbody>${controls.map(([key, t]) => `<tr><th scope="row">${e(key)}</th><td data-label="Raw time">${hours(t.rawSeconds)}</td><td data-label="Rounded billing time">${t.billingSeconds === null ? 'Not supplied' : hours(t.billingSeconds)}</td><td data-label="Already billed raw time">${hours(t.billedSeconds)}</td><td data-label="Unbilled raw time">${hours(t.unbilledSeconds)}</td><td data-label="Source cost">${t.costMinor === null ? 'Unknown' : money(t.costMinor, preview.package.manifest.currency)}</td><td data-label="Source billable value">${money(t.billMinor, preview.package.manifest.currency)}</td></tr>`).join('')}</tbody></table></div>`
}

export function harvestTimeNote(source?: Value) {
 if (!source || source.rawSeconds === undefined) return ''
 return `<span class="g-sub">Harvest source: ${e(hours(source.rawSeconds))} raw; ${source.billingSeconds === null ? 'billing rounding not supplied' : `${e(hours(source.billingSeconds))} rounded billing`}${source.invoiceId ? `; invoice ${e(source.invoiceId)}` : ''}; ${source.billed ? 'already billed' : 'unbilled'}${source.approved === null ? '' : `; source ${source.approved ? 'approved' : 'unapproved'}`}${source.locked === null ? '' : `; source ${source.locked ? 'locked' : 'unlocked'}`}. Source evidence only.</span>`
}
