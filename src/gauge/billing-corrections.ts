import { type Row, type Value, need } from './model'

// Approved artifacts stay unchanged. Reconstruct the current reviewed amounts
// from the original source lines and each approved delta along its single branch.
export function correctionReview(packets: Row[], packet: Row) {
 need(packet.value.status === 'approved', 'Choose an approved packet', 409)
 need(!packets.some(p => p.value.status !== 'cancelled' && p.value.correctsPacketId === packet.id), 'This packet has a newer correction; review the current packet before correcting it', 409)
 const chain: Row[] = [], seen = new Set<string>(), byId = new Map(packets.map(p => [p.id, p]))
 let current: Row | undefined = packet
 while (current) {
  need(!seen.has(current.id) && current.value.status === 'approved' && current.value.engagementId === packet.value.engagementId, 'Correction history is invalid', 409)
  seen.add(current.id); chain.unshift(current)
  const parentId: string | undefined = current.value.correctsPacketId
  current = parentId ? byId.get(parentId) : undefined
  need(!parentId || current, 'Original packet is unavailable', 409)
 }
 const sources: Value[] = chain[0].value.lines.map((line: Value) => ({...line,currentAmountMinor:line.amountMinor}))
 for (const step of chain.slice(1)) for (const line of step.value.lines) {
  const source = sources.find(s => s.kind === line.kind && s.sourceId === line.sourceId)
  need(source && Number.isSafeInteger(line.correctedAmountMinor), 'Correction source is invalid', 409)
  source.currentAmountMinor = line.correctedAmountMinor
 }
 return {packetId:packet.id,revision:packet.revision,originalPacketId:chain[0].id,sources}
}

export function correctionReviews(packets: Row[]) {
 const predecessors = new Set(packets.filter(p => p.value.status !== 'cancelled').map(p => p.value.correctsPacketId))
 return packets.filter(p => p.value.status === 'approved' && !predecessors.has(p.id)).map(p => correctionReview(packets,p))
}
