import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { harness } from './gauge-harness.mjs'

const h = await harness({ mailOff: true, finishSetup: false })
try {
 const { db, post, request } = h
 assert.equal((await request('/health')).status, 200)
 const signIn = await request('/signin')
 assert.equal(signIn.status, 200)
 assert.doesNotMatch(await signIn.text(), /action="\/auth\/magic-link"/)
 const magicLink = await post('/auth/magic-link', { email: h.vars.OWNER_EMAIL })
 assert.equal(magicLink.status, 503)
 assert.equal((await magicLink.json()).error, 'mail_off')

 // Supply the grant that the hosted CLI writes over the Cloudflare D1 edge.
 const owner = (await (await request('/auth/session', h.owner)).json()).operator
 const token = randomBytes(32).toString('base64url')
 const digest = createHash('sha256').update('owner-signin\0' + token).digest('hex')
 const now = Date.now()
 await db.prepare('INSERT INTO oa_owner_signins(id,token_hash,operator_id,operator_version,created_at,expires_at) VALUES(?,?,?,?,?,?)')
  .bind(randomUUID(), digest, owner.id, owner.version, now, now + 900_000).run()
 const preview = await request('/auth/owner-signin?' + new URLSearchParams({ token }))
 assert.equal(preview.status, 200)
 const entered = await post('/auth/owner-signin', { token })
 assert.equal(entered.status, 303)
 const cookie = entered.headers.getSetCookie().map(header => header.split(';')[0]).join('; ')
 assert.equal((await (await request('/auth/session', cookie)).json()).operator.id, owner.id)
 assert.equal((await post('/auth/owner-signin', { token })).status, 400)

 const setup = await request('/setup', cookie, { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes&currency=AUD&timezone=Australia%2FBrisbane' })
 assert.equal(setup.status, 303)
 assert.equal((await request('/api/gauge/state', cookie)).status, 200)
 const invitation = await post('/auth/invite', { email: 'new-member@example.test', displayName: 'New member', role: 'member' }, cookie)
 assert.equal(invitation.status, 503)
 assert.equal((await invitation.json()).error, 'mail_off')
 for (const action of ['invoice:queue-mail', 'commercial:send']) {
  assert.equal((await h.cmd(action, {}, cookie, 503)).error, 'mail_off')
 }
 assert.deepEqual(h.providerRequests, [])
 console.log('Mail-off Worker admits the owner once, completes setup and refuses outbound mail.')
} finally {
 await h.dispose()
}
