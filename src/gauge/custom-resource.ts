import { type Row,type Value } from './model'
import { matchesCustom } from './custom-values'
import { projectMatches } from './custom-report'
export function personMatches(data:Record<string,Row[]>,person:Row,filters:Value){
 const personFilters=Object.fromEntries(Object.entries(filters).filter(([id])=>data.customFields.some(f=>f.id===id&&f.value.scope==='people')))
 if(!matchesCustom(person.value,personFilters))return false
 const related=Object.fromEntries(Object.entries(filters).filter(([id])=>data.customFields.some(f=>f.id===id&&f.value.scope!=='people')))
 if(!Object.keys(related).length)return true
 return data.engagements.filter(e=>e.value.leadId===person.id||e.value.members?.includes(person.id)||[...data.staffing,...data.time].some(r=>r.value.engagementId===e.id&&r.value.personId===person.id)).some(e=>projectMatches(data,e.id,related))
}
