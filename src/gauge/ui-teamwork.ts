import type { Bindings } from '../auth.server'
import type { Actor } from './store'
import type { Value } from './model'
import { moveInSection } from './ui-scoro'
export const teamworkSection=(env:Bindings,a:Actor,options:Value)=>moveInSection(env,a,options,'teamwork')
