// This edition's identity: what its installed Lobby and its run site say.
// The name and colour are the ones setup saves in src/branding.json; replace
import type { EditionIdentity } from './base/identity'
import branding from './branding.json'
import site from '../deploy-site.json'

export const identity: EditionIdentity = {
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} keeps agency engagements, time approval, capacity and billing preparation in your own workspace.',
  tagline: 'Gauge carries each engagement from estimate and retainer through staffing, time and invoices to cash, and plans the recovery when a project drifts.',
  signInPath: '/signin',
  // The run site `rer deploy --site` publishes (deploy-site.json).
  runSite: `https://${site.domain}`,
  // An installed instance serves the Lobby at /.
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  band: '/site/band-1536.webp',
  fonts: '/fonts/fonts.css',
  accentColor: branding.primaryColor,
}
