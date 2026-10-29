import { createBusinessSettings } from '../modules/business-settings/index.ts'
import { createOperatorAuth } from '../modules/operator-auth/index.mjs'
import { authConfig,type Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'

export const business={settings:1 as const,values:['display_name'] as const,team:{roles:{admin:'admin',member:'member'}}}
export function gaugeBusiness(env:Bindings){
 const team=createOperatorAuth({db:env.DB,config:authConfig(env),mailSender:operatorMail(env),clientIp:()=>''}).businessTeam
 return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business,team})
}
