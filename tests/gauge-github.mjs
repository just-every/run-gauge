import assert from 'node:assert/strict'
import {createPublicKey,createVerify,generateKeyPairSync,randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// CONNECT-007 / CONNECT-021 through the production Worker: a GitHub App installation fake at the network edge verifies the
// RS256 App token and answers only for the installed repository. Its other repository must never be contacted.
const org='synthetic-gauge-org',installed=`${org}/synthetic-gauge-repo-1`,other=`${org}/synthetic-gauge-repo-2`
const privateTitle='Synthetic merged beta work',privateBody='synthetic-private-body-text',login='synthetic-gauge-login'
const when=day=>`2026-10-${String(day).padStart(2,'0')}T03:00:00Z`

export function githubEdge({appId,installationId,publicKey,granted=[installed]}){
 const edge={tokens:new Map(),requests:[],issues:[],failIssue:false,granted,items:{pulls:[],issues:[],reviews:{}}}
 const verify=jwt=>{const [head,claims,signature]=jwt.split('.'),body=JSON.parse(Buffer.from(claims,'base64url'));assert(createVerify('RSA-SHA256').update(`${head}.${claims}`).verify(publicKey,Buffer.from(signature,'base64url')),'App token is signed by the App key');assert.equal(body.iss,appId);assert(body.exp-body.iat<=660,'App token lives at most ten minutes');return body}
 edge.handler=async(req,body)=>{
  const url=new URL(req.url);if(url.origin!=='https://api.github.com')return null
  const auth=req.headers.get('authorization')??'',bearer=auth.replace(/^Bearer /,''),path=url.pathname
  edge.requests.push({method:req.method,path,body})
  assert(req.headers.get('user-agent')&&req.headers.get('x-github-api-version'),'GitHub API headers are sent')
  if(path===`/app/installations/${installationId}/access_tokens`){
   verify(bearer);assert.equal(req.method,'POST')
   const repositories=body.repositories??granted.map(r=>r.split('/')[1])
   if(!repositories.every(name=>granted.some(full=>full.split('/')[1]===name)))return Response.json({message:'Not Found'},{status:422})
   const token=`synthetic-gauge-installation-${edge.tokens.size+1}`;edge.tokens.set(token,{permissions:body.permissions,repositories})
   return Response.json({token,permissions:body.permissions,repository_selection:'selected',repositories:repositories.map(name=>({name}))},{status:201})
  }
  const grant=edge.tokens.get(bearer);assert(grant,`Unrecognized GitHub credential for ${path}`)
  if(path==='/installation/repositories')return Response.json({total_count:granted.length,repositories:granted.map((full_name,i)=>({id:100+i,full_name,private:true}))})
  const repo=/^\/repos\/([^/]+\/[^/]+)\//.exec(path)?.[1]
  assert.notEqual(repo,other,'The unauthorized repository is never contacted')
  if(!repo||!granted.includes(repo)||!grant.repositories.includes(repo.split('/')[1]))return Response.json({message:'Not Found'},{status:404})
  if(path.endsWith('/pulls')){assert(grant.permissions.pull_requests==='read'&&!Object.values(grant.permissions).includes('write'),'Reads use read-only permissions');return Response.json(edge.items.pulls)}
  if(path.endsWith('/issues')&&req.method==='GET')return Response.json(edge.items.issues)
  if(path.endsWith('/reviews'))return Response.json(edge.items.reviews[path.split('/').at(-2)]??[])
  if(path.endsWith('/issues')&&req.method==='POST'){
   assert.equal(grant.permissions.issues,'write');edge.issues.push(body)
   if(edge.failIssue)return Response.json({message:'boom'},{status:500})
   return Response.json({number:40+edge.issues.length,html_url:`https://github.com/${repo}/issues/${40+edge.issues.length}`},{status:201})
  }
  throw Error(`Unexpected GitHub request ${req.method} ${path}`)
 }
 return edge
}
export const pull=(number,over={})=>({number,title:`Synthetic pull ${number}`,state:'closed',merged_at:null,html_url:`https://github.com/${installed}/pull/${number}`,labels:[{name:'synthetic-label'}],created_at:when(10),updated_at:when(20),closed_at:null,body:privateBody,draft:false,user:{login},head:{ref:'synthetic-branch'},...over})

export async function githubJourney(browser){
 const h=await harness({databaseBinding:true,currency:'USD',timezone:'America/New_York'}),{cmd,state,request}=h
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}})
 const appId='910001',installationId='920002',credential=`${appId}:${installationId}:${Buffer.from(privateKey).toString('base64')}`
 const edge=githubEdge({appId,installationId,publicKey});h.providerEdge.handler=edge.handler
 const context=await browser.newContext({ignoreHTTPSErrors:true});const shots=process.env.GAUGE_GITHUB_SHOTS;if(shots)await mkdir(shots,{recursive:true})
 try{
  const client=await cmd('save:clients',{name:'Harbor Studio'}),person=await cmd('save:people',{name:'Jordan Lane',timezone:'America/New_York'})
  await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:8000,billMinor:15000})
  const project=await cmd('save:engagements',{name:'Harbor beta delivery',clientId:client.id,leadId:person.id,members:[person.id],scope:'GitHub evidence',timezone:'America/New_York'})
  const unrelated=await cmd('save:engagements',{name:'Unrelated project',clientId:client.id,leadId:person.id,members:[person.id],scope:'No repositories',timezone:'America/New_York'})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'fixed',amountMinor:50000,effortSeconds:3600,roundingSeconds:60,reason:'Fixed beta fee'}))
  const milestone=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:project.id,name:'Beta release',due:'2026-10-30',amountMinor:50000}))
  const roles=[];for(const [i,role] of ['finance','lead','staff','agent'].entries()){const user=await h.invite('synthetic-gauge-gh-'+i);roles.push({...user,role});await cmd('grant',{operatorId:user.id,role,enabled:true,...(role==='agent'?{purpose:'time',engagementIds:[project.id]}:{personId:person.id})})}

  // The credential is sealed like every provider key; the GitHub account is the installation only.
  const connected=await cmd('provider:connect',{provider:'github',accountLabel:'Harbor GitHub App',credential})
  const connection=(await state()).data.providerConnections.find(r=>r.id===connected.id);assert.deepEqual(connection.value.scopes,['repo:read','issue:write']);assert.equal(connection.value.lastFour,installationId.slice(-4))
  assert(!JSON.stringify(await state()).includes(Buffer.from(privateKey).toString('base64').slice(0,60)),'The private key never appears in state')

  // An unauthorized repository is refused from the installation list and is never contacted, even by name.
  const refused=await cmd('github:select-repo',{connectionId:connected.id,fullName:other,engagementId:project.id,reason:'Try an uninstalled repository'},h.owner,403)
  assert.match(refused.error,/not part of the GitHub App installation/)
  assert.equal((await state()).data.githubRepos.length,0)
  const refusalAudit=await(await request('/api/gauge/audit?action=github:refused',h.owner)).text();assert(refusalAudit.includes('repository-not-in-installation'),'The refusal is audited');assert(!refusalAudit.includes(other),'The refusal audit does not echo the repository name')
  const selected=await cmd('github:select-repo',{connectionId:connected.id,fullName:installed,engagementId:project.id,reason:'Harbor beta repository'})
  await cmd('github:select-repo',{connectionId:connected.id,fullName:installed,engagementId:unrelated.id,reason:'Second binding'},h.owner,409)

  edge.items.pulls=[
   pull(1,{title:privateTitle,state:'closed',merged_at:when(20),closed_at:when(20),body:`${privateBody}\nGauge milestone: Beta release`}),
   pull(2,{state:'open',updated_at:when(19)}),
   pull(3,{state:'closed',closed_at:when(18),updated_at:when(18),body:'Gauge milestone: Beta release'}),
   pull(4,{title:'Names nothing real',state:'closed',merged_at:when(17),updated_at:when(17),body:'Gauge milestone: No such milestone'}),
  ]
  edge.items.issues=[{number:5,title:'Synthetic open issue',state:'open',html_url:`https://github.com/${installed}/issues/5`,labels:[],comments:2,created_at:when(11),updated_at:when(16),body:privateBody,user:{login}},{...pull(1),pull_request:{}}]
  edge.items.reviews={1:[{user:{id:7},state:'COMMENTED',submitted_at:when(15)},{user:{id:7},state:'APPROVED',submitted_at:when(16)},{user:{id:8},state:'CHANGES_REQUESTED',submitted_at:when(16)}]}

  // First read through the owner's page; commits and pushes have no GitHub door here, so only these four items and one issue exist.
  const page=await context.newPage();await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.goto(h.origin+'/app/access')
  const form=action=>page.locator('form').filter({has:page.locator(`input[name="action"][value="${action}"]`)})
  await Promise.all([page.waitForResponse(r=>r.url()===h.origin+'/app/action'&&r.request().method()==='POST'),form('github:sync').getByRole('button',{name:'Read now',exact:true}).click()])
  let data=(await state()).data,repo=data.githubRepos[0]
  assert.equal(repo.value.lastSync.status,'read');assert.equal(data.githubEvidence.length,5)
  assert(data.githubEvidence.every(r=>r.value.billable===false&&!('body' in r.value)&&!JSON.stringify(r.value).includes(privateBody)&&!JSON.stringify(r.value).includes(login)),'Evidence keeps no body text, branch or login and is never billable')
  const merged=data.githubEvidence.find(r=>r.value.kind==='pull'&&r.value.number===1)
  assert.deepEqual(merged.value.reviews,{approved:1,changesRequested:1,commented:0},'Only each reviewer\'s latest decision counts')
  assert.equal(data.githubEffects.length,1,'Only the merged pull request naming exactly one milestone proposes an effect')
  const effect=data.githubEffects[0];assert.equal(effect.value.milestoneId,milestone.id);assert.equal(effect.value.status,'proposed');assert.equal(effect.value.deliveredOn,'2026-10-19')
  assert.equal(data.time.length,0);assert.equal(data.packets.length,0,'Evidence creates no time or billing')
  assert(edge.requests.every(r=>!r.path.includes('/commits')&&!r.path.includes('/contents')&&!r.path.includes(other)),'No commit, content or other-repository read')
  await form('github:sync').first().scrollIntoViewIfNeeded()
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/access');await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`GitHub evidence fits ${width}`);if(shots)await page.locator('#github-evidence').screenshot({path:`${shots}/github-${width}.png`})}

  // A repeated read changes nothing; the same request key replays the acknowledgement.
  const again=await cmd('github:sync',{id:repo.id,revision:repo.revision});assert.equal(again.changed,0);assert.equal(again.proposed,0)
  const revisions=(await state()).data.githubEvidence.map(r=>r.revision).sort();assert.deepEqual(revisions,data.githubEvidence.map(r=>r.revision).sort())

  // Every other role, the agent grant, an app credential holder and the client see none of it.
  for(const role of roles){
   const seen=await state(role.cookie);for(const kind of ['githubRepos','githubEvidence','githubEffects','githubFollowups'])assert.deepEqual(seen.data[kind]??[],[],`${role.role} sees no ${kind}`)
   for(const refusedAction of ['github:sync','github:select-repo','github:effect-approve','github:followup-send'])await cmd(refusedAction,{id:repo.id,revision:repo.revision},role.cookie,403)
   const history=await(await request(`/api/gauge/history/githubEvidence/${merged.id}`,role.cookie)).text();assert(!history.includes(privateTitle),`${role.role} history has no title`)
  }

  // Approving the proposal records one delivery; it neither accepts nor bills the milestone.
  const approved=await cmd('github:effect-approve',{id:effect.id,revision:effect.revision,reason:'The merged pull request is the delivered beta'})
  await cmd('github:effect-approve',{id:effect.id,revision:effect.revision,reason:'Again'},h.owner,409)
  data=(await state()).data;const delivered=data.milestones.find(r=>r.id===milestone.id)
  assert.equal(delivered.value.delivery.deliveries.length,1);assert.equal(delivered.value.delivery.deliveries[0].date,'2026-10-19');assert.match(delivered.value.delivery.deliveries[0].reason,/^Merged pull request evidence /)
  assert(!JSON.stringify(delivered.value).includes(privateTitle)&&!JSON.stringify(delivered.value).includes(installed),'The milestone carries no repository name or title')
  assert.equal(data.githubEffects[0].value.status,'approved');assert.equal(data.githubEffects[0].value.result.id,milestone.id);void approved
  const authorize=await cmd('milestone:authorize',delivered,h.owner,409);assert.match(authorize.error,/client acceptance/)

  // A client invited to review the delivery sees its name and date, never repository, title or evidence.
  const invited=await h.invite('casey');const release=await cmd('milestone:release-review',{...delivered,key:randomUUID(),contact:'casey@example.test',days:7,reason:'Client reviews the beta',description:'The beta is delivered for your review'})
  const review=(await state()).data.milestones.find(r=>r.id===milestone.id).value.delivery.clientReviews.at(-1)
  const seen=await request(`/api/gauge/client-milestones/${milestone.id}/${review.id}`,invited.cookie,{headers:{'x-gauge-review-token':release.token}});assert.equal(seen.status,200)
  const clientText=await seen.text();for(const secret of [privateTitle,installed,privateBody,login,'github','GitHub'])assert(!clientText.includes(secret),`Client review omits ${secret}`)
  const clientState=await request('/api/gauge/state?from=2026-10-01&to=2026-10-31',invited.cookie);assert.notEqual(clientState.status,200,'A client has no state door')

  // The App losing a repository refuses the next read and keeps the evidence already read.
  edge.granted.length=0;edge.granted.push(other.replace('repo-2','repo-9'))
  repo=(await state()).data.githubRepos[0];const revoked=await cmd('github:sync',{id:repo.id,revision:repo.revision})
  assert.equal(revoked.status,'exception');assert.equal(revoked.exceptionClass,'repository-not-granted');assert.equal((await state()).data.githubEvidence.length,5)
  edge.granted.length=0;edge.granted.push(installed)

  // Owner-approved issue follow-up: exact text drafted, reviewed, then sent once. GitHub's answer comes back as evidence.
  const draft=await cmd('github:followup-draft',{repoId:repo.id,title:'Fix the beta follow-up',body:'Synthetic follow-up text',reason:'Client asked for a fix'})
  const toSend=(await state()).data.githubFollowups[0];assert.equal(toSend.value.status,'drafted');assert.equal(edge.issues.length,0,'Drafting sends nothing')
  await cmd('github:followup-send',{id:draft.id,revision:toSend.revision})
  const sent=(await state()).data.githubFollowups[0];assert.equal(sent.value.status,'created');assert.equal(edge.issues.length,1);assert.deepEqual(edge.issues[0],{title:'Fix the beta follow-up',body:'Synthetic follow-up text'})
  await cmd('github:followup-send',{id:draft.id,revision:sent.revision},h.owner,409);assert.equal(edge.issues.length,1,'A sent follow-up is never sent twice')
  edge.failIssue=true
  const second=await cmd('github:followup-draft',{repoId:repo.id,title:'Uncertain follow-up',body:'Synthetic second text',reason:'Exercise an unconfirmed send'})
  const secondRow=(await state()).data.githubFollowups.find(r=>r.id===second.id);await cmd('github:followup-send',{id:second.id,revision:secondRow.revision})
  assert.equal((await state()).data.githubFollowups.find(r=>r.id===second.id).value.status,'uncertain');assert.equal(edge.issues.length,2,'An unconfirmed send is not retried');edge.failIssue=false

  // Rotation and revocation take effect on the next read; the revoked connection reaches GitHub no more.
  repo=(await state()).data.githubRepos[0]
  const rotated=await cmd('provider:rotate',{id:connected.id,revision:connection.revision,credential});assert(rotated.saved)
  const used=edge.requests.length;await cmd('github:sync',{id:repo.id,revision:repo.revision})
  const current=(await state()).data.providerConnections.find(r=>r.id===connected.id);await cmd('provider:revoke',{id:current.id,revision:current.revision})
  repo=(await state()).data.githubRepos[0];const stopped=edge.requests.length
  await cmd('github:sync',{id:repo.id,revision:repo.revision},h.owner,409)
  assert.equal(edge.requests.length,stopped,'A revoked connection makes no GitHub request');assert(stopped>used)
  const uses=(await state()).data.providerUses.filter(r=>['repo:read','issue:write'].includes(r.value.operation));assert(uses.length>=5);assert(!JSON.stringify(uses).includes('synthetic-gauge-installation'),'Provider use holds no token')
  const evidenceText=JSON.stringify((await h.db.prepare('SELECT data FROM g_audit').all()).results)+JSON.stringify((await h.db.prepare('SELECT result FROM g_receipts').all()).results)
  for(const secret of ['synthetic-gauge-installation',privateBody,login,Buffer.from(privateKey).toString('base64').slice(0,60)])assert(!evidenceText.includes(secret),`Audit and receipts omit ${secret}`)
  console.log('PASS CONNECT-007 / CONNECT-021 githubJourney: sealed GitHub App credential and App-signed least-permission tokens, installation-only repository selection, unauthorized repository refused and never contacted, read-only PR and issue evidence without code, bodies or logins, merged-PR milestone proposal approved into one delivery that is neither accepted nor billable, client and every non-owner role see nothing, exact approved issue follow-up sent once and uncertain send never retried, rotation and revocation, owner Access at 1440 and 390')
 }finally{await context.close();await h.dispose()}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{await githubJourney(browser)}finally{await browser.close()}
}
