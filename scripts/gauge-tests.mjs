import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

// The complete public-door wall is unchanged. CI divides it into independently
// required jobs; local invocation without a shard retains the full suite.
const suites = [
 ["node", "tests/gauge-scoro.mjs"],
 [
  "node",
  "tests/gauge.mjs"
 ],
 [
  "node",
  "tests/gauge-currency.mjs"
 ],
 [
  "node",
  "tests/gauge-harvest-history.mjs"
 ],
 [
  "node",
  "tests/gauge-rate-cards.mjs"
 ],
 [
  "node",
  "tests/gauge-finance-forecast.mjs"
 ],
 [
  "node",
  "tests/gauge-project-scenarios.mjs"
 ],
 [
  "node",
  "tests/gauge-cash-forecast.mjs"
 ],
 [
  "node",
  "tests/gauge-clients.mjs"
 ],
 [
  "node",
  "tests/gauge-expected-cash.mjs"
 ],
 [
  "node",
  "tests/gauge-demand-forecast.mjs"
 ],
 [
  "node",
  "tests/gauge-pipeline.mjs"
 ],
 [
  "node",
  "tests/gauge-report-lineage.mjs"
 ],
 [
  "node",
  "tests/gauge-utilization.mjs"
 ],
 [
  "node",
  "tests/gauge-resources.mjs"
 ],
 [
  "node",
  "tests/gauge-schedule.mjs"
 ],
 [
  "node",
  "tests/gauge-tasks.mjs"
 ],
 [
  "node",
  "tests/gauge-delivery.mjs"
 ],
 [
  "node",
  "tests/gauge-retainers.mjs"
 ],
 [
  "node",
  "tests/gauge-timesheets.mjs"
 ],
 [
  "node",
  "tests/gauge-handoffs.mjs"
 ],
 [
  "node",
  "tests/gauge-audit.mjs"
 ],
 [
  "node",
  "tests/gauge-agent.mjs"
 ],
 [
  "node",
  "--test",
  "--test-concurrency=1",
  "tests/gauge-forecast.mjs"
 ]
]
const groups = [
 [
  "gauge.mjs",
  "gauge-currency.mjs",
  "gauge-harvest-history.mjs",
  "gauge-rate-cards.mjs",
  "gauge-pipeline.mjs"
 ],
 [
  "gauge-scoro.mjs",
  "gauge-cash-forecast.mjs",
  "gauge-clients.mjs",
  "gauge-expected-cash.mjs",
  "gauge-forecast.mjs"
 ],
 [
  "gauge-agent.mjs",
  "gauge-finance-forecast.mjs",
  "gauge-project-scenarios.mjs",
  "gauge-handoffs.mjs"
 ],
 [
  "gauge-retainers.mjs",
  "gauge-timesheets.mjs",
  "gauge-tasks.mjs",
  "gauge-audit.mjs"
 ],
 [
  "gauge-delivery.mjs",
  "gauge-demand-forecast.mjs",
  "gauge-report-lineage.mjs",
  "gauge-utilization.mjs",
  "gauge-resources.mjs",
  "gauge-schedule.mjs"
 ]
]
const names=suites.map(s=>basename(s.at(-1))),assigned=groups.flat()
if(new Set(assigned).size!==assigned.length||assigned.length!==names.length||names.some(n=>!assigned.includes(n))||suites.some(s=>!existsSync(s.at(-1))))throw Error('Gauge shard inventory must contain every suite exactly once')
let selected=suites
if(process.env.GAUGE_TEST_SHARD){
 const m=/^([1-9]\d*)\/([1-9]\d*)$/.exec(process.env.GAUGE_TEST_SHARD)
 if(!m||Number(m[2])!==groups.length||Number(m[1])>groups.length)throw Error(`GAUGE_TEST_SHARD must be 1/${groups.length} through ${groups.length}/${groups.length}`)
 const group=groups[Number(m[1])-1];selected=suites.filter(s=>group.includes(basename(s.at(-1))))
}
if(process.argv.includes('--list'))process.stdout.write(JSON.stringify(selected)+'\n')
else for(const suite of selected){const result=spawnSync(process.execPath,suite.slice(1),{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1)}
