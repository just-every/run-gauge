import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'

// SETUP-002 / SETUP-007 / SETUP-008 client and contact workspace through the command, client search, state, audit and Engagements page doors:
// two similarly named clients, a merge of the duplicate with an explicit payment-terms choice, search by PO and external
// ID afterwards, and every linked engagement and opportunity still attached to the surviving client and its terms.
const h = await harness({ currency: 'USD', timezone: 'America/New_York' })
try {
 const { cmd, request, owner, state } = h
 const search = async (q, cookie = owner, expected = 200) => { const r = await request(`/api/gauge/clients?q=${encodeURIComponent(q)}`, cookie); assert.equal(r.status, expected, `search ${q}`); return r.json() }
 const client = async id => (await state()).data.clients.find(c => c.id === id)
 const ada = await cmd('save:people', { name: 'Ada Ruiz', timezone: 'America/New_York' })
 const lead = await h.invite('Ada'); await cmd('grant', { operatorId: lead.id, personId: ada.id, role: 'lead', enabled: true })

 // Finance keeps the legal client, billing and project contacts, addresses, tax and exemption references, PO requirement and numbers, tags and external IDs.
 const survivor = await cmd('save:clients', {
  name: 'Northwind Studio', legalName: 'Northwind Studio LLC', paymentTermsDays: 45,
  contacts: 'billing; Mia Chen; ap@northwind.example; +1 212 555 0100\nproject; Leo Park; leo@northwind.example',
  addresses: 'billing; 1 Main St; Suite 4; New York; NY; 10001; US', taxId: 'EIN 12-3456789', exemptions: 'NY ST-120 4471',
  poRequired: true, poNumbers: 'PO-1001', tags: 'design, priority', externalIds: 'hubspot:5001',
 })
 const saved = await client(survivor.id)
 assert.equal(saved.value.legalName, 'Northwind Studio LLC')
 assert.deepEqual(saved.value.contacts, [{ role: 'billing', name: 'Mia Chen', email: 'ap@northwind.example', phone: '+1 212 555 0100' }, { role: 'project', name: 'Leo Park', email: 'leo@northwind.example', phone: null }])
 assert.deepEqual(saved.value.addresses, [{ purpose: 'billing', line1: '1 Main St', line2: 'Suite 4', city: 'New York', region: 'NY', postalCode: '10001', country: 'US' }])
 assert.equal(saved.value.taxId, 'EIN 12-3456789'); assert.deepEqual(saved.value.exemptions, ['NY ST-120 4471']); assert.equal(saved.value.poRequired, true)
 assert.deepEqual(saved.value.poNumbers, ['PO-1001']); assert.deepEqual(saved.value.tags, ['design', 'priority']); assert.deepEqual(saved.value.externalIds, [{ system: 'hubspot', id: '5001' }])
 // A save that leaves a field out keeps it; an external identity belongs to one active client.
 await cmd('save:clients', { id: survivor.id, revision: saved.revision, name: 'Northwind Studio', paymentTermsDays: 45 })
 assert.deepEqual((await client(survivor.id)).value.contacts, saved.value.contacts)
 await cmd('save:clients', { name: 'Northwind copy', externalIds: [{ system: 'HubSpot', id: '5001' }] }, owner, 409)
 await cmd('save:clients', { name: 'Bad contact', contacts: 'vendor; Someone' }, owner, 400)

 // The similarly named duplicate, with its own PO, external IDs, terms, two engagements and an opportunity.
 const duplicate = await cmd('save:clients', { name: 'Northwind Studios', paymentTermsDays: 30, poNumbers: ['PO-2002'], externalIds: 'hubspot:5002, quickbooks:88', contacts: [{ role: 'billing', name: 'Mia Chen', email: 'ap@northwind.example', phone: '+1 212 555 0100' }], tags: 'Design, retainer' })
 const keep = await cmd('save:engagements', { name: 'Brand refresh', clientId: survivor.id, leadId: ada.id, members: [ada.id], scope: 'Brand', timezone: 'America/New_York' })
 const website = await cmd('save:engagements', { name: 'Website build', clientId: duplicate.id, leadId: ada.id, members: [ada.id], scope: 'Website', timezone: 'America/New_York' })
 const support = await cmd('save:engagements', { name: 'Support', clientId: duplicate.id, leadId: ada.id, members: [ada.id], scope: 'Support', timezone: 'America/New_York' })
 const deal = await cmd('save:opportunities', { name: 'Phase two', clientId: duplicate.id, ownerId: ada.id, stage: 'proposal', probability: 50, from: '2026-12-01', to: '2026-12-11', services: 'Design', amountMinor: 800000, demandSeconds: 72000 })
 await cmd('budget:approve', await cmd('save:budgets', { engagementId: website.id, mode: 'fixed', amountMinor: 1000000, effortSeconds: 36000, roundingSeconds: 60, reason: 'Fixed fee' }))
 const launch = await cmd('save:milestones', { engagementId: website.id, name: 'Launch', due: '2026-11-02', amountMinor: 1000000 }); await cmd('milestone:approve', launch)
 const card = await cmd('save:rates', { clientId: duplicate.id, service: '*', effective: '2026-01-01', billMinor: 16000 })

 // Search by name finds both; by PO or external ID only the client that carries it. Search and the workspace are finance's.
 assert.deepEqual((await search('northwind')).clients.map(c => c.id).sort(), [survivor.id, duplicate.id].sort())
 assert.deepEqual((await search('po-2002')).clients.map(c => [c.id, c.matches]), [[duplicate.id, ['po']]])
 await search('PO-2002', lead.cookie, 403)
 const leadView = (await state(lead.cookie)).data.clients.find(c => c.id === duplicate.id).value
 for (const key of ['legalName', 'contacts', 'addresses', 'taxId', 'exemptions', 'poRequired', 'poNumbers', 'tags', 'externalIds', 'paymentTermsDays']) assert(!(key in leadView), `a lead never reads ${key}`)
 assert.equal(leadView.name, 'Northwind Studios')

 // The merge binds both exact revisions, refuses leads, differing terms without a choice and the duplicate's client cards in force.
 let [s, d] = [await client(survivor.id), await client(duplicate.id)]
 const merge = (input, cookie = owner, expected = 200) => cmd('client:merge', { survivorId: s.id, survivorRevision: s.revision, duplicateId: d.id, duplicateRevision: d.revision, reason: 'Duplicate created at intake', ...input }, cookie, expected)
 await merge({}, lead.cookie, 403)
 await merge({ duplicateRevision: survivor.revision }, owner, 409)
 const differ = await merge({ terms: 'survivor' }, owner, 409)
 assert.match(differ.error, /client rate cards in force/)
 await cmd('rate:withdraw', { id: card.id, revision: card.revision, reason: 'Client cards move to the surviving client' })
 const unchosen = await merge({}, owner, 409)
 assert.match(unchosen.error, /Payment terms differ \(Net 45, 100% collection against Net 30, 100% collection\)/)
 await merge({ terms: 'survivor' })

 // After the merge: PO and external ID searches find the surviving client; the duplicate is never a result.
 for (const q of ['PO-2002', 'hubspot:5002', '5002', 'quickbooks:88', 'PO-1001']) assert.deepEqual((await search(q)).clients.map(c => c.id), [survivor.id], q)
 assert.deepEqual((await search('northwind')).clients.map(c => c.id), [survivor.id])
 const found = (await search('hubspot:5002')).clients[0]
 assert.deepEqual(found.matches, ['externalId']); assert.deepEqual(found.engagementIds.sort(), [keep.id, website.id, support.id].sort())
 // Every linked engagement and the opportunity stay attached, now to the surviving client, which keeps its chosen Net 45 terms.
 const data = (await h.request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-20', owner).then(r => r.json()))
 for (const id of [keep.id, website.id, support.id]) assert.equal(data.data.engagements.find(e => e.id === id).value.clientId, survivor.id)
 assert.equal(data.data.opportunities.find(o => o.id === deal.id).value.clientId, survivor.id)
 const kept = data.data.clients.find(c => c.id === survivor.id).value, retired = data.data.clients.find(c => c.id === duplicate.id).value
 assert.equal(kept.paymentTermsDays, 45); assert.deepEqual(kept.mergedFrom, [duplicate.id])
 assert.deepEqual(kept.externalIds, [{ system: 'hubspot', id: '5001' }, { system: 'hubspot', id: '5002' }, { system: 'quickbooks', id: '88' }])
 assert.deepEqual(kept.poNumbers, ['PO-1001', 'PO-2002']); assert.deepEqual(kept.tags, ['design', 'priority', 'retainer']); assert.equal(kept.contacts.length, 2)
 assert.equal(retired.merge.into, survivor.id); assert.equal(retired.merge.terms, 'survivor'); assert.equal(retired.merge.reason, 'Duplicate created at intake')
 // FINANCE-002 / FINANCE-009 / FINANCE-010 places the moved milestone on the surviving client's Net 45, not "Net 30 assumed": due 2 November, received 17 December.
 const cash = data.cash.engagements.find(x => x.engagementId === website.id)
 assert.equal(cash.termsLabel, 'Net 45'); assert.equal(data.cash.months.find(m => m.month === '2026-12').expectedMinor, 1000000)
 // The merged duplicate takes no new work, edit or second merge; the lead sees the moved engagements under the surviving name.
 await cmd('save:engagements', { name: 'Late work', clientId: duplicate.id, leadId: ada.id, members: [], scope: 'Late', timezone: 'America/New_York' }, owner, 409)
 d = await client(duplicate.id); s = await client(survivor.id)
 await cmd('save:clients', { id: d.id, revision: d.revision, name: 'Northwind Studios' }, owner, 409)
 await merge({ terms: 'duplicate' }, owner, 409)
 const leadData = (await state(lead.cookie)).data
 assert.deepEqual(leadData.clients.map(c => c.value.name), ['Northwind Studio'])
 // GOVERN-005 / GOVERN-011: the merge is audited on every record it changed.
 const audit = await h.request('/api/gauge/audit?action=client:merge', owner).then(r => r.json())
 assert.deepEqual(audit.entries.map(x => `${x.kind}:${x.recordId}`).sort(), [`clients:${survivor.id}`, `clients:${duplicate.id}`, `engagements:${website.id}`, `engagements:${support.id}`, `opportunities:${deal.id}`].sort())
 // The Engagements page searches by PO and offers the merge on a client's edit view.
 const page = await h.request('/app/engagements?clientSearch=PO-2002', owner).then(r => r.text())
 assert.match(page, /Matched by PO · 3 projects/); assert.match(page, /Merged: Northwind Studios into Northwind Studio \(Duplicate created at intake\)/)
 const other = await cmd('save:clients', { name: 'Harbor Labs' })
 assert.match(await h.request(`/app/engagements?edit=${other.id}`, owner).then(r => r.text()), /Merge Harbor Labs into another client/)
 console.log('SETUP-002 / SETUP-007 / SETUP-008 client workspace, search and merge: ok')
} finally { await h.dispose() }
