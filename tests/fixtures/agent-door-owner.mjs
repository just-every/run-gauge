import { randomUUID } from 'node:crypto'

// Native production owner lifecycle; no database or authentication substitution.
export default async function({request,origin,claim,displayName,returnTo,reviewers}){
 const bootstrap=await request(new URL(claim.path,origin).href,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:claim.token,displayName,returnTo})})
 if(bootstrap.status!==303)throw Error('Native signed owner claim failed')
 const cookie=bootstrap.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')
 const form=await request(origin+'/setup',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({confirm:'yes',currency:'USD',timezone:'America/New_York'}).toString()})
 if(form.status!==303)throw Error('Native agency setup failed')
 const cmd=async(action,args)=>{const response=await request(origin+'/api/gauge/command',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({key:randomUUID(),action,...args})});if(!response.ok)throw Error('Native fixture command refused');return response.json()}
 const person=await cmd('save:people',{name:'Casey Designer',timezone:'America/New_York'})
 const client=await cmd('save:clients',{name:'Cedar Studio'})
 const engagement=await cmd('save:engagements',{name:'Cedar launch',clientId:client.id,leadId:person.id,members:[person.id],scope:'Accepted design work',timezone:'America/New_York'})
 await cmd('save:tasks',{engagementId:engagement.id,name:'Design handoff',remainingSeconds:7200})
 const agent=await reviewers.initialize('agency-agent',{email:'synthetic-gauge-owner@example.com',cookie})
 const session=await(await request(origin+'/auth/session',{headers:{Cookie:agent.cookie}})).json()
 await cmd('grant',{operatorId:session.operator.id,role:'agent',enabled:true,purpose:'time',engagementIds:[engagement.id]})
 // Base 0.2.86 creates act.sub only after this hook returns. No invented binding
 // or self-grant is installed; conformance must expose that missing lifecycle.
 return bootstrap
}
