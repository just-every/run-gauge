import assert from 'node:assert/strict'
import { harness } from './gauge-harness.mjs'
import { adoptedOutcome } from './fixtures/recovery-outcomes.mjs'

// A pinned month boundary makes wrong cash placement visible even when totals agree.
export async function recoveryOutcomeBasisJourney() {
 const asOf='2026-10-27',h=await harness({currency:'USD',timezone:'UTC',now:asOf+'T12:00:00Z',tickClock:true})
 try {
  const {cmd}=h,fixture=await adoptedOutcome(h,'synthetic-gauge-9340')
  const {adopted,day,client,person,replacement,projects}=fixture
  const compare=async()=>cmd('recovery:outcome-compare',await cmd('recovery:outcome-capture',adopted))
  const original=await compare()
  const monthly=result=>result.months.map(m=>({month:m.month,currency:m.currency,before:m.beforeMinor,expected:m.expectedMinor,observed:m.observedMinor,historicalBefore:m.historicalBeforeMinor,historicalExpected:m.historicalExpectedMinor,historicalObserved:m.historicalObservedMinor,variance:m.varianceMinor,historicalVariance:m.historicalVarianceMinor}))
  assert.deepEqual(monthly(original),[
   {month:'2026-10',currency:'USD',before:500000,expected:0,observed:0,historicalBefore:0,historicalExpected:0,historicalObserved:0,variance:0,historicalVariance:0},
   {month:'2026-11',currency:'USD',before:30000,expected:540000,observed:540000,historicalBefore:530000,historicalExpected:540000,historicalObserved:540000,variance:0,historicalVariance:0}
  ])
  // A third project's booking contributes to global load without widening the fixed project set.
  const other=await cmd('save:engagements',{name:'synthetic-gauge-9341 parallel support',clientId:client.id,leadId:person.id,members:[replacement.id],scope:'Separate support engagement',timezone:'UTC'})
  const booking=await cmd('save:staffing',{engagementId:other.id,personId:replacement.id,service:'Support',from:day(2),to:day(3),dailySeconds:3600,commitment:'committed'})
  const calendar=(await h.state()).data.calendars.find(c=>c.value.personId===replacement.id)
  await cmd('calendar:change',{...calendar,...calendar.value,from:day(2),dailySeconds:21600})
  const global=await compare()
  assert.deepEqual(global.projectIds,original.projectIds)
  assert(!global.projectIds.includes(other.id))
  assert.deepEqual(global.loads.filter(d=>d.personId===replacement.id).map(d=>({date:d.date,before:d.beforeSeconds,expected:d.expectedSeconds,observed:d.observedSeconds,variance:d.varianceSeconds,beforeAvailable:d.beforeAvailableSeconds,expectedAvailable:d.expectedAvailableSeconds,observedAvailable:d.observedAvailableSeconds,capacityVariance:d.capacityVarianceSeconds})),[
   {date:'2026-10-29',before:0,expected:7200,observed:10800,variance:3600,beforeAvailable:28800,expectedAvailable:28800,observedAvailable:21600,capacityVariance:-7200},
   {date:'2026-10-30',before:0,expected:7200,observed:10800,variance:3600,beforeAvailable:28800,expectedAvailable:28800,observedAvailable:21600,capacityVariance:-7200}
  ])
  assert(global.changedInputs.some(s=>s.kind==='staffing'&&s.id===booking.id&&s.change==='added'))
  assert(global.changedInputs.some(s=>s.kind==='calendars'&&s.id===calendar.id&&s.change==='revised'))
  assert.deepEqual(monthly(global),monthly(original),'Other-project load and calendar availability do not change these projects cash')
  const savedClient=(await h.state()).data.clients.find(c=>c.id===client.id)
  await cmd('save:clients',{...savedClient,...savedClient.value,daysLate:31})
  const state=(await h.state()).data,traffic=h.providerRequests.length,late=await compare()
  assert.deepEqual(late.before,original.before);assert.deepEqual(late.expected,original.expected)
  assert.deepEqual(monthly(late),[
   {month:'2026-10',currency:'USD',before:500000,expected:0,observed:0,historicalBefore:0,historicalExpected:0,historicalObserved:0,variance:0,historicalVariance:0},
   {month:'2026-11',currency:'USD',before:30000,expected:540000,observed:540000,historicalBefore:530000,historicalExpected:540000,historicalObserved:0,variance:0,historicalVariance:-540000},
   {month:'2026-12',currency:'USD',before:0,expected:0,observed:0,historicalBefore:0,historicalExpected:0,historicalObserved:540000,variance:0,historicalVariance:540000}
  ])
  assert.deepEqual(late.projects,original.projects)
  assert.deepEqual((await h.state()).data,state)
  assert.equal(h.providerRequests.length,traffic)
  console.log('PROBE RECOVER-003 monthly: adopted HTTP recovery across October and November -> expected November 540000 cents; later approved 31-day timing moves historical cash exactly to December, leaving retained predictions unchanged')
  console.log('PROBE RECOVER-003 global-load: third-project booking and reduced calendar -> October 29 and 30 each show 10800 observed seconds versus 7200 expected, available 21600 versus 28800; original project set and margins unchanged')
 } finally {await h.dispose()}
}
