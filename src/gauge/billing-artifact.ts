import { type Value, csv } from './model'

/** The same immutable preparation download accompanies manual and scheduled approval. */
export function packetArtifact(value:Value){
 return csv([['Gauge billing preparation',value.currency,'Not an invoice'],['kind','source id','approved revision','description','actual duration seconds','amount minor','currency','rate id','budget id','bill rate minor per hour','rounded billing seconds','rounding increment seconds','rounding policy','corrected source total minor'],...value.lines.map((l:Value)=>[l.kind,l.sourceId,l.sourceRevision,l.description,l.durationSeconds,l.amountMinor,l.currency,l.rateId,l.budgetId,l.billRateMinor,l.roundedBillingSeconds,l.roundingSeconds,l.roundingPolicy,l.correctedAmountMinor??'']),['TOTAL','','','','',value.totalMinor,value.currency]])
}
