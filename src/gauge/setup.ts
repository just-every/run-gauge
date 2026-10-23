import { initializeProviderKey } from './provider-custody'
import { firstRunResponse, needsFirstRun } from '../base/setup'
import type { FrameTheme } from '../base/theme-frame'
import { operatorAuth, type Bindings } from '../auth.server'
import { actor, Transaction } from './store'
import { agency, currencies, defaults } from './agency'
import { Fault, need, zone } from './model'
import { escape } from './ui-forms'
import { profileValue, monthName } from './agency-profile'

// Gauge extends the native first-run form without changing Base's copied files.
export async function agencySetupResponse(request: Request, env: Bindings, auth: ReturnType<typeof operatorAuth>, options: { theme?: FrameTheme } = {}): Promise<Response | null> {
 const url = new URL(request.url)
 if (url.pathname !== '/setup') return firstRunResponse(request, env, auth, options)
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin' }
 try {
  need(url.origin === env.AUTH_ORIGIN && (!request.headers.has('host') || request.headers.get('host')?.toLowerCase() === url.host.toLowerCase()), 'Invalid host', 403)
  if (request.method === 'POST') {
   need(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403)
   const session = await auth.getSession(request)
   need(session, 'Sign in required', 401); need(session.operator.role === 'owner', 'Only the owner completes setup', 403)
   if (!await needsFirstRun(env, session)) return new Response(null, { status: 303, headers: { ...headers, location: '/app' } })
   need(request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'), 'Use the setup form')
   const form = await request.formData()
   need(form.get('confirm') === 'yes', 'Confirm the owner account')
   const current = await agency(env), currency = String(form.get('currency') ?? current.currency), timezone = zone(form.get('timezone') ?? current.timezone)
   need(currencies.includes(currency as typeof currencies[number]), 'Choose a supported agency currency')
   const profile = profileValue(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')), { session }, 'First-run agency setup', true)
   const name = form.get('displayName')
   if (typeof name === 'string' && auth.changeDisplayName && name.trim() !== session.operator.displayName) await auth.changeDisplayName(request, { displayName: name })
   const tx = new Transaction(env, await actor(env, session))
   // A concurrent completion cannot change the currency after another tab opens the app.
   tx.guard('NOT EXISTS(SELECT 1 FROM oa_first_run WHERE singleton=1)')
   tx.sql('INSERT INTO g_agency(singleton,currency,timezone) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET currency=excluded.currency,timezone=excluded.timezone', currency, timezone)
   tx.sql('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?)', session.operator.id, Date.now())
   if (profile) await tx.record('agencyProfiles', profile, undefined, undefined, 'agency:profile')
   tx.audit('agency:setup', 'agency', 'agency', { currency, timezone })
   await initializeProviderKey(env, tx)
   await tx.commit()
   return new Response(null, { status: 303, headers: { ...headers, location: '/app' } })
  }
  const response = await firstRunResponse(request, env, auth, options)
  if (!response || response.status !== 200 || request.method === 'HEAD') return response
  const current = await agency(env)
  const fields = `<label>Agency currency <select class="g-agency-currency" name="currency" required>${currencies.map(c => `<option value="${c}"${c === current.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label><p>All rates, budgets, expenses and billing packets use this currency. Historical records keep their currency; Gauge does not convert money.</p><label>Work timezone <input name="timezone" required value="${escape(current.timezone || defaults.timezone)}" placeholder="America/Los_Angeles"></label><fieldset class="g-agency-profile"><legend>Agency profile (optional now; the owner can set it later on Access)</legend><label>Legal business name <input name="legalBusiness" maxlength="200" autocomplete="organization"></label><label>US billing address <input name="addressLine1" maxlength="200" autocomplete="address-line1"></label><label>Address line 2 <input name="addressLine2" maxlength="200" autocomplete="address-line2"></label><label>City <input name="city" maxlength="100" autocomplete="address-level2"></label><label>State <input name="state" maxlength="2" placeholder="NY" autocomplete="address-level1"></label><label>ZIP code <input name="postalCode" maxlength="10" placeholder="10001" autocomplete="postal-code"></label><label>EIN (owner-only, never printed on documents) <input name="einReference" maxlength="10" placeholder="12-3456789" autocomplete="off"></label><label>Fiscal year starts in <select class="g-agency-currency" name="fiscalYearStartMonth">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${monthName(i + 1)}</option>`).join('')}</select></label></fieldset>`
  return new Response((await response.text()).replace('</head>', '<link rel="stylesheet" href="/gauge-setup.css"></head>').replace('<p><label><input type="checkbox"', `${fields}<p><label><input type="checkbox"`), response)
 } catch (error) {
  return Response.json({ error: error instanceof Fault ? error.message : 'Setup could not be saved. Reload and review your choices.' }, { status: error instanceof Fault ? error.status : 409, headers })
 }
}
