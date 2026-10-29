import { randomUUID } from 'node:crypto'
import { agency } from './agent-door-owner.mjs'

// Discovery authenticates the Business agent before the initial policy phase.
// The owner binds that recorded identity using Gauge's ordinary Access command.
export default async function({phase,request,origin,cookie}) {
 if(phase==='initial') {
  const get=async path=>{
   const response=await request(origin+path,{headers:{Cookie:cookie}})
   if(!response.ok)throw Error('Native owner read refused')
   return response.json()
  }
  const inventory=await get('/agents/api/agents')
  if(inventory.agents?.length!==1)throw Error('Expected one authenticated company agent')
  if(!agency.operatorId||!agency.engagementId)throw Error('Native owner agent grant unavailable')
  const response=await request(origin+'/api/gauge/command',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({key:randomUUID(),action:'grant',operatorId:agency.operatorId,role:'agent',enabled:true,purpose:'time',engagementIds:[agency.engagementId],businessAgentId:inventory.agents[0].id})})
  if(!response.ok)throw Error('Native owner agent binding refused')
 }
 return {values:{},clients:{}}
}
