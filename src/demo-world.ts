// Northbound Studio's October (Portland, OR): the people, clients, engagements and five weeks of bookings the demo
// seeds, matching the homepage's records. Week 0 is the work week the demo opens on; dates are offsets from its Monday.
// Money is integer cents and hours are per working day, as Gauge stores them.

export interface Person { id: string; name: string; contractor?: boolean; cost: number; bill: number; dailyHours: number }
export const people: Person[] = [
 { id: 'maya', name: 'Maya Chen', cost: 7200, bill: 17500, dailyHours: 7.2 },
 { id: 'priya', name: 'Priya Patel', cost: 7000, bill: 17500, dailyHours: 6.4 },
 { id: 'sam', name: 'Sam Reyes', cost: 6800, bill: 17500, dailyHours: 7.2 },
 { id: 'diego', name: 'Diego Ramos', cost: 6800, bill: 17500, dailyHours: 7.2 },
 // Tom's supplied availability is 20 hrs a week; in week 0 he keeps Tuesday and Wednesday open (see calendars below).
 { id: 'tom', name: 'Tom Becker', contractor: true, cost: 8500, bill: 17500, dailyHours: 4 },
 { id: 'marcus', name: 'Marcus Bell', cost: 8000, bill: 19000, dailyHours: 7.2 },
 { id: 'owen', name: 'Owen Park', cost: 8000, bill: 19000, dailyHours: 7.2 },
 { id: 'rachel', name: 'Rachel Kim', cost: 8000, bill: 19000, dailyHours: 7.2 },
 // A placeholder is a person record too: no hours until Capitol Grain's start, then 24 a week.
 { id: 'senior-dev', name: 'Senior developer (placeholder)', cost: 9000, bill: 19000, dailyHours: 0 },
]

/** Calendars that differ from one calendar at the person's daily hours: [from, to, hours per working day]. */
export const calendars: Record<string, [number, number, number][]> = {
 tom: [[-35, -1, 4], [0, 0, 3], [1, 2, 7], [3, 4, 1.5], [5, 70, 4]],
 'senior-dev': [[-35, 20, 0], [21, 70, 4.8]],
}

export interface Project { id: string; client: string; name: string; scope: string; lead: string; mode: 'hourly' | 'fixed'; fee: number; effortHours: number; approved: boolean; reason: string; tasks: string[]; services: string[]; notes: string[] }
export const projects: Project[] = [
 { id: 'cascade', client: 'Cascade Cider', name: 'Website and launch', scope: 'New brand site with taproom finder, online shop handover and a Fri launch in three fixed-fee milestones.', lead: 'owen', mode: 'fixed', fee: 8640000, effortHours: 576, approved: true, reason: 'Signed fixed fee: 3 × $28,800 milestones', tasks: ['Taproom finder build', 'Launch content and QA'], services: ['Development', 'Design'], notes: ['Taproom finder map and store hours', 'Launch page copy fit and QA pass'] },
 { id: 'pacific', client: 'Pacific Trail', name: 'Checkout rebuild', scope: 'Rebuilt checkout, saved carts and order tracking, launching Fri Nov 20.', lead: 'rachel', mode: 'fixed', fee: 6390000, effortHours: 426, approved: true, reason: 'Signed fixed fee for the checkout rebuild', tasks: ['Checkout build', 'Checkout UX'], services: ['Development', 'Design'], notes: ['Saved cart and address validation', 'Checkout UX review with PT-212 changes'] },
 { id: 'willamette', client: 'Willamette CU', name: 'Member site retainer', scope: 'Monthly retainer: 40 hrs of design and development; overage billed hourly.', lead: 'marcus', mode: 'hourly', fee: 1200000, effortHours: 40, approved: true, reason: 'October retainer: 40 hrs', tasks: ['Sprint work', 'Sprint review'], services: ['Design', 'Development'], notes: ['Rates page and loan calculator fixes', 'Sprint review with the member team'] },
 { id: 'treasure', client: 'Treasure Valley', name: 'Clinic site support', scope: 'Hourly support to a $10,000 not-to-exceed cap.', lead: 'owen', mode: 'hourly', fee: 1000000, effortHours: 66.5, approved: true, reason: 'Not-to-exceed $10,000, billed hourly', tasks: ['Clinic pages', 'Support'], services: ['Design', 'Support'], notes: ['Clinic location pages', 'Form fixes for appointment requests'] },
 { id: 'capitol', client: 'Capitol Grain', name: 'Wholesale site', scope: 'Estimate v2: 400 hrs, wholesale portal moved to phase 2. Proposal sent; awaiting acceptance.', lead: 'rachel', mode: 'fixed', fee: 5280000, effortHours: 400, approved: false, reason: 'Estimate v2 sent with the proposal: 400 hrs, $52,800', tasks: ['Discovery', 'Build'], services: ['Design', 'Development'], notes: ['', ''] },
 { id: 'rose', client: 'Rose City Running Co.', name: 'Design retainer', scope: 'Monthly design retainer from Mon Nov 16, 12 hrs a week.', lead: 'marcus', mode: 'hourly', fee: 900000, effortHours: 48, approved: false, reason: 'Retainer in HubSpot pipeline: 12 hrs a week', tasks: ['Design'], services: ['Design'], notes: [''] },
]

/** Bookings by week 0 to 4: [person, project, hours that week, tentative]. Each becomes a Mon–Fri allocation. */
type Booking = [string, string, number, boolean?]
export const weeks: Booking[][] = [
 [['maya', 'cascade', 24], ['maya', 'willamette', 4], ['maya', 'treasure', 4], ['priya', 'cascade', 16], ['priya', 'pacific', 8], ['priya', 'willamette', 4], ['sam', 'pacific', 28], ['sam', 'willamette', 4], ['diego', 'cascade', 35], ['marcus', 'willamette', 12], ['marcus', 'pacific', 8], ['owen', 'cascade', 10], ['owen', 'treasure', 2], ['rachel', 'pacific', 10]],
 [['maya', 'cascade', 28], ['maya', 'willamette', 4], ['priya', 'cascade', 16], ['priya', 'pacific', 8], ['priya', 'willamette', 4], ['sam', 'pacific', 28], ['sam', 'willamette', 4], ['diego', 'cascade', 24], ['diego', 'pacific', 8], ['tom', 'cascade', 6], ['marcus', 'willamette', 12], ['marcus', 'pacific', 8], ['owen', 'cascade', 10], ['rachel', 'pacific', 10]],
 [['maya', 'cascade', 28], ['maya', 'willamette', 4], ['priya', 'cascade', 16], ['priya', 'pacific', 4], ['priya', 'willamette', 4], ['sam', 'pacific', 28], ['sam', 'willamette', 4], ['diego', 'cascade', 24], ['diego', 'pacific', 8], ['tom', 'cascade', 6], ['marcus', 'willamette', 12], ['marcus', 'pacific', 8], ['owen', 'cascade', 10], ['rachel', 'pacific', 10]],
 [['maya', 'cascade', 16], ['maya', 'capitol', 16, true], ['maya', 'willamette', 4], ['priya', 'cascade', 16], ['priya', 'pacific', 4], ['priya', 'willamette', 4], ['sam', 'pacific', 28], ['sam', 'willamette', 4], ['diego', 'cascade', 20], ['diego', 'pacific', 12], ['tom', 'capitol', 12, true], ['marcus', 'willamette', 12], ['marcus', 'pacific', 8], ['owen', 'cascade', 10], ['rachel', 'pacific', 10], ['rachel', 'capitol', 8, true], ['senior-dev', 'capitol', 24, true]],
 [['maya', 'rose', 12, true], ['maya', 'capitol', 16, true], ['maya', 'willamette', 4], ['priya', 'pacific', 8], ['priya', 'willamette', 4], ['priya', 'cascade', 8, true], ['sam', 'pacific', 24], ['sam', 'willamette', 4], ['diego', 'pacific', 20], ['diego', 'pacific', 8, true], ['tom', 'capitol', 12, true], ['marcus', 'willamette', 12], ['marcus', 'pacific', 8], ['owen', 'cascade', 4], ['rachel', 'pacific', 10], ['rachel', 'capitol', 8, true], ['senior-dev', 'capitol', 24, true]],
]
/** Tom's week-0 Cascade hours sit on the days his calendar opens: Mon 3, Thu–Fri 1.5 each (6 hrs). */
export const tomWeekZero: [number, number, number][] = [[0, 0, 3], [3, 4, 1.5]]

/** The agency's operators: Jess Alvarez owns the studio and holds finance; leads and staff sign in with grants. */
export const team = [
 { id: 'owen', email: 'owen.park@northbound.example', name: 'Owen Park', role: 'lead' },
 { id: 'rachel', email: 'rachel.kim@northbound.example', name: 'Rachel Kim', role: 'lead' },
 { id: 'marcus', email: 'marcus.bell@northbound.example', name: 'Marcus Bell', role: 'lead' },
 { id: 'maya', email: 'maya.chen@northbound.example', name: 'Maya Chen', role: 'staff' },
 { id: 'sam', email: 'sam.reyes@northbound.example', name: 'Sam Reyes', role: 'staff' },
]
export const ownerName = 'Jess Alvarez'
export const agentName = 'Gauge recovery agent'
