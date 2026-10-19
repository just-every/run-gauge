import { capacityLineage } from './report-lineage-capacity'
import { economicLineage } from './report-lineage-economics'
import { exceptionLineage } from './report-lineage-exceptions'
import { correctionLineage, pipelineLineage } from './report-lineage-pipeline'
import { Lineage, type ReportLineageInput } from './report-lineage-shared'

export type { LineageFigure, LineageSource, ReportLineageInput } from './report-lineage-shared'

/** Pure lineage over the exact authorized report snapshot; no clocks or DB reads. */
export function buildLineage(report: ReportLineageInput) {
 const c = new Lineage(report)
 economicLineage(c)
 capacityLineage(c)
 pipelineLineage(c)
 exceptionLineage(c)
 correctionLineage(c)
 return c.figures
}
