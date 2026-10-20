import type { Kind, Row, Value } from './model'

export type ScenarioEffect = { kind: Kind; source?: Row; value: Value; id?: string }
export type Alternative = {
 effects: ScenarioEffect[]
 engagementIds: string[]
 peopleIds: string[]
 dates: string[]
 details: Value
}
