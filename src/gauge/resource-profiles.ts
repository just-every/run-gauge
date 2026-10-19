import { type Value, flag, integer, need, text } from './model'

interface Skill { name: string; proficiency: number }

function skills(value: unknown): Skill[] {
 need(Array.isArray(value) || typeof value === 'string', 'Skills must be an array or comma-separated name:proficiency pairs')
 const entries: unknown[] = typeof value === 'string'
  ? value.trim() === '' ? [] : value.split(',').map(entry => {
   const parts = entry.split(':')
   need(parts.length === 2, 'Use skills as name:proficiency, comma-separated')
   return { name: parts[0].trim(), proficiency: parts[1].trim() }
  })
  : value
 need(entries.length <= 50, 'Use at most 50 skills')
 const names = new Set<string>()
 return entries.map(entry => {
  need(entry !== null && typeof entry === 'object' && !Array.isArray(entry), 'Each skill needs a name and proficiency')
  const raw = entry as Value
  const name = text(raw.name, 'Skill name', 100)
  need(!/[:,]/.test(name), 'Skill names cannot contain commas or colons')
  const normalized = name.toLowerCase()
  need(!names.has(normalized), 'Skill names must be unique (ignoring case)')
  names.add(normalized)
  return { name, proficiency: integer(raw.proficiency, 'Skill proficiency', 1, 5) }
 })
}

function optionalText(value: unknown, label: string): string {
 need(typeof value === 'string', `${label} must be text`)
 return value.trim() === '' ? '' : text(value, label, 200)
}

/** Omitted profile fields retain their saved values; explicit empty fields clear them. */
export function resourceProfile(input: Value, previous: Value = {}): Value {
 const employmentType = input.employmentType !== undefined ? input.employmentType
  : input.contractor !== undefined ? flag(input.contractor) ? 'contractor' : 'employee'
  : previous.employmentType !== undefined ? previous.employmentType
  : flag(previous.contractor) ? 'contractor' : 'employee'
 need(employmentType === 'employee' || employmentType === 'contractor', 'Choose employee or contractor')
 return {
  skills: skills(input.skills === undefined ? previous.skills === undefined ? [] : previous.skills : input.skills),
  team: optionalText(input.team === undefined ? previous.team === undefined ? '' : previous.team : input.team, 'Team'),
  location: optionalText(input.location === undefined ? previous.location === undefined ? '' : previous.location : input.location, 'Location'),
  role: optionalText(input.role === undefined ? previous.role === undefined ? '' : previous.role : input.role, 'Role'),
  employmentType,
  contractor: employmentType === 'contractor',
 }
}
