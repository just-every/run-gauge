// Gauge's one graphic device: a reading on a fine tick scale. Minor ticks every
// fortieth of the scale, a major tick every fifth, solid fill to the reading,
// a hatched tentative run after it and one marker at the value; labels for the
// start, the value and the end below. Past the end the marker sits beyond the
// end tick and turns to the warning colour. The app and the run site's drawings
// both draw it. Coordinates are percentages of the drawn width, so the scale
// needs no inline style (the app's CSP allows none).
import { escape as e } from './ui-forms'

export interface Reading {
 /** The reading, e.g. approved seconds; null when unknown. */
 value: number | null
 /** The scale's end, e.g. the estimate; null when unknown. */
 end: number | null
 /** A tentative run drawn hatched after the value. */
 tentative?: number
 /** Formats a scale quantity for the labels. */
 format: (n: number) => string
 /** The accessible reading, e.g. "42 h approved of 60 h". */
 label: string
 /** White on a cyanotype sheet (the run site's drawings). */
 light?: boolean
 /** The landing draws a bar marker; the app a dot. */
 marker?: 'dot' | 'bar'
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
export function ruler({ value, end, tentative = 0, format, label, light = false, marker = 'dot' }: Reading) {
 const reading = value ?? 0, over = value !== null && end !== null && value > end
 const max = end === null ? Math.max(reading + tentative, 1) : over ? reading * 1.08 : Math.max(end, reading + tentative, 1)
 const at = (n: number) => Math.min(Math.max(n / max, 0), 1)
 const stop = end === null ? 1 : at(end), ticks = []
 for (let i = 0; i <= 40; i++) ticks.push(`<line class="g-tick${i % 5 ? '' : ' g-tick--major'}" x1="${pct(i / 40 * stop)}" x2="${pct(i / 40 * stop)}" y1="16" y2="${i % 5 ? 10 : 5}"/>`)
 if (over) ticks.push(`<line class="g-tick g-tick--major" x1="100%" x2="100%" y1="16" y2="5"/>`)
 const v = at(reading), t = at(reading + tentative)
 const fill = value === null ? '' : `<rect class="g-fill" x="0" y="14.5" width="${pct(v)}" height="3"/>`
 const hatch = value !== null && tentative > 0 ? `<rect x="${pct(v)}" y="12.5" width="${pct(t - v)}" height="7" fill="url(#${light ? 'g-hatch-light' : 'g-hatch'})"/>` : ''
 const mark = value === null ? '' : marker === 'bar' ? `<rect class="g-mark" x="${pct(v)}" y="8" width="3" height="16" transform="translate(-1.5 0)"/>` : `<circle class="g-mark" cx="${pct(v)}" cy="16" r="5.5"/>`
 const labels = [`<text x="0" y="36">${e(format(0))}</text>`]
 if (end !== null) labels.push(`<text x="${pct(stop)}" y="36" text-anchor="${stop > 0.97 ? 'end' : 'middle'}">${e(format(end))}</text>`)
 if (value !== null && value !== 0 && (end === null || value !== end)) {
  const near = v < 0.1 || Math.abs(v - stop) < 0.1
  if (!near) labels.push(`<text class="g-reading" x="${pct(v)}" y="36" text-anchor="${v > 0.97 ? 'end' : 'middle'}">${e(format(value))}</text>`)
  else if (over) labels[1] = `<text x="${pct(stop)}" y="36" text-anchor="end" dx="-6">${e(format(end!))}</text><text class="g-reading" x="100%" y="36" text-anchor="end">${e(format(value))}</text>`
 }
 return `<svg class="g-ruler${light ? ' g-ruler--light' : ''}${over ? ' g-ruler--over' : ''}" role="img" aria-label="${e(label)}" width="100%" height="40"><line class="g-base" x1="0" x2="${pct(stop)}" y1="16" y2="16"/>${ticks.join('')}${fill}${hatch}${mark}${labels.join('')}</svg>`
}
