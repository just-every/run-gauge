import { randomUUID } from 'node:crypto'
import { agency } from './agent-door-owner.mjs'

// Bind the verifier's exact company agent through the native owner's Access command.
export default async function({agentId,request,origin}) {
 if(!agency.operatorId||!agency.engagementId)throw Error('Native owner agent grant unavailable')
 const response=await request(origin+'/api/gauge/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key:randomUUID(),action:'grant',operatorId:agency.operatorId,role:'agent',enabled:true,purpose:'time',engagementIds:[agency.engagementId],businessAgentId:agentId})})
 if(!response.ok)throw Error('Native owner agent binding refused')
}
