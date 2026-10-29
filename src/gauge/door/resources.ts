import type { ResourceDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { agentFields } from '../agent-data'
import type { Kind } from '../model'
import { nativeRecord } from './native'
/** The catalogue covers native records in at least one closed agent projection.
 * read re-enters that projection, so absent and restricted records both return null. */
export function gaugeResources(env:Bindings):ResourceDefinition[]{
 const kinds=[...new Set(Object.values(agentFields).flatMap(fields=>Object.keys(fields)))] as Kind[]
 return kinds.map(kind=>({uriTemplate:`gauge://${kind}/{id}`,name:`Agency ${kind}`,mimeType:'application/json',scope:'gauge:read',classes:['standard'],
  classify(record){const row=record.json as {id:string};return [{class:'standard',facts:{measure:row.id?1:0}}]},
  async read(uri,ctx){const match=new RegExp(`^gauge://${kind}/([^/?#]+)$`).exec(uri);if(!match)return null;let id;try{id=decodeURIComponent(match[1])}catch{return null}const record=await nativeRecord(env,ctx,kind,id);return record?{json:record,untrusted:true}:null},
 }))
}
