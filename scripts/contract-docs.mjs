import { readFile, writeFile } from 'node:fs/promises'
import { parseContract } from '../src/base/seed-contract.mjs'

// Preserve untouched legacy acceptance evidence; changed rows come from CONTRACT.md.
const [mode, flag, selected] = process.argv.slice(2)
if (!['write', 'check'].includes(mode) || flag !== '--clauses' || !selected) throw Error('Use write or check --clauses ID[,ID]')
const ids = selected.split(','), source = await readFile('CONTRACT.md', 'utf8')
const cells = line => line.slice(1, -1).split(/(?<!\\)\|/).map(s => s.trim())
const rows = source.split('\n').filter(line => /^\| `[A-Z][A-Z0-9-]+` \|/.test(line)).map(cells)
const tally = selected => ['done', 'partial', 'missing'].map(status => selected.filter(r => r[3] === status).length)
let contract = source
for (const [label, selected] of [['Published', rows.filter(r => r[2] === 'published')], ['Target and push further', rows.filter(r => r[2] !== 'published')], ['All', rows]]) {
 const counts = tally(selected)
 contract = contract.replace(new RegExp(`^\\| ${label} \\|.*$`, 'm'), `| ${label} | ${counts.join(' | ')} | ${selected.length} |`)
}
const parsed = parseContract(contract)
let acceptance = await readFile('ACCEPTANCE.md', 'utf8')
const added = []
for (const id of ids) {
 const clause = parsed.clauses.find(c => c.id === id)
 if (!clause) throw Error(`Unknown clause ${id}`)
 const evidence = rows.find(r => r[0] === `\`${id}\``)[4]
 const outcome = clause.text.split('**Acceptance evidence:**')[1]?.trim() ?? clause.text
 const line = acceptance.split('\n').find(line => line.startsWith('| ') && cells(line)[1] === id)
 if (!line && !/^BASE-AGENT-/.test(id)) throw Error(`No legacy acceptance row for ${id}`)
 const old = line ? cells(line) : [String(parsed.clauses.findIndex(c=>c.id===id)+1)], escape = s => s.replace(/\|/g, '\\|').replace(/\n/g,' ')
 const detail = `${outcome}${evidence ? ` Evidence: ${evidence}.` : ''}${clause.gap ? ` Remaining: ${clause.gap}` : ''}`
 const rendered = `| ${old[0]} | ${id} | ${escape(clause.title)} | ${escape(detail)} | ${clause.status} |`
 if (line) acceptance = acceptance.replace(line, rendered)
 else added.push(rendered)
}
if (added.length) acceptance += '\n## Base-delivered agent surface\n\n| # | Clause | What a person can do | Test | Status |\n| --- | --- | --- | --- | --- |\n' + added.join('\n') + '\n'
const claims = '# Contract claims\n\nGenerated from CONTRACT.md by scripts/contract-docs.mjs. [The authoritative contract](../CONTRACT.md#status) retains each clause’s complete acceptance obligations, Evidence, Gap and judgment provenance. Partial and missing clauses retain every obligation named there.\n\n'
 + '| Clause | Status | Evidence paths |\n| --- | --- | --- |\n'
 + parsed.clauses.map(c => `| \`${c.id}\` | ${c.status} | ${c.evidence.map(p => `\`${p}\``).join('; ')} |`).join('\n') + '\n'
for (const [file, expected] of [['CONTRACT.md', contract], ['ACCEPTANCE.md', acceptance], ['docs/CLAIMS.md', claims]]) {
 if (mode === 'write') await writeFile(file, expected)
 else {
  const actual = await readFile(file, 'utf8').catch(() => '')
  if (actual !== expected) throw Error(`${file} is stale; run contract-docs.mjs write with the same clause arguments`)
 }
}
console.log(`Contract documents ${mode}: ${ids.join(', ')}; ${parsed.counts.total} clauses retained`)
