import {stripeArchiveJourney} from '../fixtures/stripe-archive.mjs'
import {harness} from '../gauge-harness.mjs'
import {stripePaymentJourney} from '../gauge-invoices.mjs'
const h=await harness({currency:'USD',timezone:'America/New_York'})
try{await stripePaymentJourney(h);await stripeArchiveJourney(h);console.log('PASS stripePaymentJourney')}finally{await h.dispose()}
