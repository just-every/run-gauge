import type { DevPersona } from './modules/operator-auth/dev/index.mjs'
// Persona sign-in creates only native operators. The owner explicitly maps each
// to a real Gauge person/grant in Access; names alone confer no product authority.
export function devPersonas(): DevPersona[] {
 return [
  { as: 'staff', role: 'member', displayName: 'Dev staff (requires Gauge grant)' },
  { as: 'lead', role: 'member', displayName: 'Dev assigned lead (requires Gauge grant)' },
  { as: 'unrelated-lead', role: 'member', displayName: 'Dev unrelated lead (requires Gauge grant)' },
  { as: 'finance', role: 'member', displayName: 'Dev finance (requires Gauge grant)' },
  { as: 'agent', role: 'member', displayName: 'Dev agent (requires Gauge agent grant)' },
 ]
}
