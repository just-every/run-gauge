// A reading against its end (approved hours on an estimate): a thin track, turquoise to the reading, claret past the
// end. Widths are classes in twentieths, since the app's CSP allows no inline style.
import { escape as e } from './ui-forms'

export function meter(value: number, end: number, label: string) {
 const over = value > end, share = end > 0 ? Math.min(value / end, 1) : 1
 return `<span class="g-meter${over ? ' g-meter--over' : ''}" role="img" aria-label="${e(label)}"><span class="g-meter-fill g-w-${Math.round(share * 20)}"></span></span>`
}
