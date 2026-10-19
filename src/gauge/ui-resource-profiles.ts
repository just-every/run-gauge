import type { Value } from './model'
import { resourceProfile } from './resource-profiles'
import { choices, input } from './ui-forms'

export function resourceProfileFields(personValue: Value = {}): string {
 const profile = resourceProfile({}, personValue)
 return input('role', 'Role', profile.role, 'text', false)
  + input('team', 'Team', profile.team, 'text', false)
  + input('location', 'Location', profile.location, 'text', false)
  + choices('employmentType', 'Employment type', ['employee', 'contractor'], profile.employmentType)
  + input('skills', 'Skills (name:proficiency, comma-separated)', profile.skills.map((skill: { name: string; proficiency: number }) => `${skill.name}:${skill.proficiency}`).join(', '), 'text', false)
}
