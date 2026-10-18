// Gauge's homepage on the run site (run-gauge.com), as the approved design desk drew it (page s1, 18 Oct 2026): one
// October at Northbound Studio, stage by stage. Its main action is Run Gauge, which opens /run; it links no
// instance-only route.
import { siteDocument, siteFooter, type SiteLinks } from '../shell/frame'
import { hero, headline, subline } from './hero'
import { october } from './october'
import { estimateSection } from './estimate'
import { retainerSection } from './retainer'
import { staffingSection } from './staffing'
import { timeSection } from './time'
import { recoverySection } from './recovery'
import { invoiceSection } from './invoice'
import { cashSection } from './cash'
import { closeSection } from './close'
import { interlude, closing } from './scenes'
import { movingSection } from './moving'

export function landingHtml(links: SiteLinks, styles: string[]) {
 const body = `<main>${hero(links)}${october()}${estimateSection()}${retainerSection()}${staffingSection()}${timeSection()}${recoverySection()}${invoiceSection()}${cashSection()}${closeSection()}${interlude()}${movingSection()}${closing()}</main>${siteFooter(links)}`
 return siteDocument(`Gauge: ${headline}`, subline, styles, body)
}
