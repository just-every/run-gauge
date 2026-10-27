import { createMailSender } from '../modules/mail/index.mjs'
// The caller supplies only the credential just released by the custody dispatch step.
export const proposalMail = credential => createMailSender({provider:'resend',mode:'production',apiKey:credential})
