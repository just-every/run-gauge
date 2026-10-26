import assert from 'node:assert/strict'
import {createSign,randomUUID} from 'node:crypto'
import {harness} from '../gauge-harness.mjs'

// Run only with the held-key injector. The GitHub App is installed on one sandbox repository: setup writes and every Gauge
// read go there only. The "unauthorized" repository is a name the installation does not hold, which Gauge must refuse
// from the installation list without ever sending a request for it.
for(const name of ['GITHUB_APP_ID','GITHUB_APP_INSTALLATION_ID','GITHUB_APP_PRIVATE_KEY_B64'])assert(process.env[name],`Missing ${name}`)
const appId=process.env.GITHUB_APP_ID,installationId=process.env.GITHUB_APP_INSTALLATION_ID,keyB64=process.env.GITHUB_APP_PRIVATE_KEY_B64
const b64u=value=>Buffer.from(value).toString('base64url'),pem=Buffer.from(keyB64,'base64').toString()
const jwt=()=>{const now=Math.floor(Date.now()/1000),head=b64u(JSON.stringify({alg:'RS256',typ:'JWT'})),claims=b64u(JSON.stringify({iat:now-60,exp:now+540,iss:appId}));return `${head}.${claims}.${createSign('RSA-SHA256').update(`${head}.${claims}`).sign(pem).toString('base64url')}`}
const gh=async(token,method,path,body)=>{const response=await fetch('https://api.github.com'+path,{method,signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'gauge-live-proof',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const json=response.status===204?null:await response.json().catch(()=>null);return {status:response.status,json}}
const setup=(await gh(jwt(),'POST',`/app/installations/${installationId}/access_tokens`)).json.token
const installation=(await gh(setup,'GET','/installation/repositories')).json;assert.equal(installation.total_count,1,'The App is installed on exactly the sandbox repository')
const sandbox=installation.repositories[0].full_name,[owner]=sandbox.split('/'),stamp=Date.now().toString(36),uninstalled=`${owner}/synthetic-gauge-not-installed`
const base=(await gh(setup,'GET',`/repos/${sandbox}/git/ref/heads/${installation.repositories[0].default_branch}`)).json.object.sha
const milestoneName=`Live proof ${stamp}`,branch=`gauge-proof-${stamp}`,commitOnly=`gauge-commit-only-${stamp}`
const addFile=async(ref,name)=>{await gh(setup,'POST',`/repos/${sandbox}/git/refs`,{ref:`refs/heads/${ref}`,sha:base});const put=await gh(setup,'PUT',`/repos/${sandbox}/contents/${name}`,{message:`Synthetic ${ref}`,content:Buffer.from(`synthetic proof ${stamp}\n`).toString('base64'),branch:ref});assert.equal(put.status,201)}
await addFile(commitOnly,`commit-only-${stamp}.md`)
await addFile(branch,`proof-${stamp}.md`)
const opened=(await gh(setup,'POST',`/repos/${sandbox}/pulls`,{title:`Gauge live proof ${stamp}`,head:branch,base:installation.repositories[0].default_branch,body:`Synthetic proof.\nGauge milestone: ${milestoneName}`})).json
assert(opened.number,'The App opens a pull request');const merge=await gh(setup,'PUT',`/repos/${sandbox}/pulls/${opened.number}/merge`,{merge_method:'squash'});assert.equal(merge.status,200,'The App merges the pull request')

const h=await harness({currency:'USD',timezone:'America/New_York',databaseBinding:true}),{cmd,state,request}=h
const touched=[]
h.providerEdge.handler=async(req,body)=>{
 const url=new URL(req.url);if(url.origin!=='https://api.github.com')return null
 const sandboxPath=url.pathname.startsWith(`/repos/${sandbox}/`)||url.pathname==='/installation/repositories'||url.pathname===`/app/installations/${installationId}/access_tokens`
 assert(sandboxPath&&!url.pathname.includes(uninstalled),`Gauge touched only the sandbox: ${url.pathname.split('/').slice(0,3).join('/')}`);touched.push(`${req.method} ${url.pathname.replace(sandbox,'sandbox')}`)
 const response=await fetch(req.url,{method:req.method,headers:req.headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)})
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(response.body,{status:response.status,headers})
}
try{
 const client=await cmd('save:clients',{name:'Live proof client'}),person=await cmd('save:people',{name:'Morgan Hale',timezone:'America/New_York'})
 const project=await cmd('save:engagements',{name:'Live proof project',clientId:client.id,leadId:person.id,members:[person.id],scope:'GitHub live proof',timezone:'America/New_York'})
 const milestone=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:project.id,name:milestoneName,due:'2026-10-30',amountMinor:10000}))
 const connected=await cmd('provider:connect',{provider:'github',accountLabel:'Live GitHub App',credential:`${appId}:${installationId}:${keyB64}`})
 const refused=await cmd('github:select-repo',{connectionId:connected.id,fullName:uninstalled,engagementId:project.id,reason:'Unauthorized repository'},h.owner,403);assert.match(refused.error,/not part of the GitHub App installation/)
 await cmd('github:select-repo',{connectionId:connected.id,fullName:sandbox,engagementId:project.id,reason:'Live sandbox repository'})
 let repo=(await state()).data.githubRepos[0];const read=await cmd('github:sync',{id:repo.id,revision:repo.revision});assert.equal(read.status,'read')
 let data=(await state()).data;const evidence=data.githubEvidence.find(r=>r.value.kind==='pull'&&r.value.number===opened.number)
 assert(evidence?.value.merged,'The merged pull request is evidence');assert.equal(evidence.value.billable,false)
 assert(!data.githubEvidence.some(r=>JSON.stringify(r.value).includes(commitOnly)||JSON.stringify(r.value).includes('commit-only')),'A commit on a branch without a pull request creates no evidence')
 assert.equal(data.githubEffects.length,1);assert.equal(data.githubEffects[0].value.milestoneId,milestone.id)
 await cmd('github:effect-approve',{id:data.githubEffects[0].id,revision:data.githubEffects[0].revision,reason:'Live merged pull request evidences the delivery'})
 const followup=await cmd('github:followup-draft',{repoId:repo.id,title:`Gauge live follow-up ${stamp}`,body:'Synthetic approved follow-up from the live proof.',reason:'Live follow-up proof'})
 const row=(await state()).data.githubFollowups.find(r=>r.id===followup.id);await cmd('github:followup-send',{id:row.id,revision:row.revision})
 const sent=(await state()).data.githubFollowups.find(r=>r.id===followup.id);assert.equal(sent.value.status,'created')
 repo=(await state()).data.githubRepos[0];await cmd('github:sync',{id:repo.id,revision:repo.revision})
 data=(await state()).data;assert(data.githubEvidence.some(r=>r.value.kind==='issue'&&r.value.number===sent.value.issueNumber),'The approved follow-up returns as issue evidence')
 const delivered=data.milestones.find(r=>r.id===milestone.id);assert.equal(delivered.value.delivery.deliveries.length,1)
 const invited=await h.invite('casey'),release=await cmd('milestone:release-review',{...delivered,key:randomUUID(),contact:'casey@example.test',days:1,reason:'Live client view',description:'Delivered for review'})
 const review=(await state()).data.milestones.find(r=>r.id===milestone.id).value.delivery.clientReviews.at(-1)
 const clientText=await(await request(`/api/gauge/client-milestones/${milestone.id}/${review.id}`,invited.cookie,{headers:{'x-gauge-review-token':release.token}})).text()
 for(const secret of [sandbox,`Gauge live proof ${stamp}`,'github'])assert(!clientText.toLowerCase().includes(secret.toLowerCase()),'The client sees no repository or pull request context')
 // Sandbox tidy-up: close the proof issue and delete the proof branches with the same App.
 await gh(setup,'PATCH',`/repos/${sandbox}/issues/${sent.value.issueNumber}`,{state:'closed'});for(const ref of [branch,commitOnly])await gh(setup,'DELETE',`/repos/${sandbox}/git/refs/heads/${ref}`)
 console.log(JSON.stringify({receipt:'CONNECT-007 live GitHub App sandbox',pullRequest:opened.number,merged:true,evidenceItems:data.githubEvidence.length,milestoneEffect:data.githubEffects[0].value.status==='approved'?'approved':'proposed',unauthorizedRepositoryRefused:true,commitOnlyEvidence:0,issueFollowup:sent.value.issueNumber,requests:touched.length,paths:[...new Set(touched)]}))
}finally{await h.dispose()}
