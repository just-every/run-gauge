import type { Bindings } from '../auth.server'

// These currencies all use two decimal minor units. Gauge never converts money.
export const currencies = ['USD', 'AUD', 'CAD', 'EUR', 'GBP', 'NZD', 'CHF', 'SGD'] as const
export const defaults = { currency: 'USD', timezone: 'America/Los_Angeles' }
export async function agency(env: Pick<Bindings, 'DB'>): Promise<{ currency: string; timezone: string }> {
 return await env.DB.prepare('SELECT currency,timezone FROM g_agency WHERE singleton=1').first<{ currency: string; timezone: string }>() ?? { ...defaults }
}
