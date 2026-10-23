import { packageOf, control, csv } from './scoro.mjs'
export function floatFixture() {
 const rows = {
  clients: [{id:'c1',name:'Synthetic client'}],
  people: [{id:'u1',name:'Synthetic worker'}],
  projects: [{id:'p1',clientId:'c1',name:'Synthetic Float project'}],
  phases: [{id:'phase1',projectId:'p1',name:'Delivery'}],
  rates: [
   {id:'r1',personId:'u1',projectId:'p1',effective:'2025-01-01',billRateMinor:15000,costRateMinor:9000,currency:'USD'},
   {id:'r2',personId:'u1',projectId:'p1',effective:'2026-01-01',billRateMinor:18000,costRateMinor:10000,currency:'USD'}
  ],
  budgets: [{id:'budget1',projectId:'p1',phaseId:'phase1',date:'2025-01-01',amountMinor:100000,currency:'USD'}],
  allocations: [
   {id:'a1',projectId:'p1',personId:'u1',phaseId:'phase1',from:'2025-03-03',to:'2025-03-04',daily:JSON.stringify([{date:'2025-03-03',hours:'1.5'},{date:'2025-03-04',hours:'0.5'}]),unit:'hours-per-day',budgetId:'budget1',phaseBudgetMinor:100000,currency:'USD'},
   {id:'a2',projectId:'p1',personId:'u1',phaseId:'phase1',from:'2026-03-02',to:'2026-03-03',daily:JSON.stringify([{date:'2026-03-02',hours:'1'},{date:'2026-03-03',hours:'2'}]),unit:'hours-per-day',budgetId:'budget1',phaseBudgetMinor:100000,currency:'USD'},
   {id:'a3',projectId:'p1',personId:'u1',phaseId:'phase1',from:'2026-03-04',to:'2026-03-04',daily:JSON.stringify([{date:'2026-03-04',hours:'1'}]),unit:'hours-per-day',budgetId:'budget1',phaseBudgetMinor:100000,currency:'USD'}
  ],
  time: [
   {id:'t1',projectId:'p1',personId:'u1',phaseId:'phase1',workDate:'2025-03-03',duration:'1',billable:'1',unit:'hours',rateId:'r1',billMinor:15000,costMinor:9000,currency:'USD'},
   {id:'t2',projectId:'p1',personId:'u1',phaseId:'phase1',workDate:'2026-03-02',duration:'2',billable:'2',unit:'hours',rateId:'r2',billMinor:36000,costMinor:20000,currency:'USD'}
  ],
  workweeks: [
   {id:'w1',personId:'u1',from:'2025-01-01',to:'2025-12-31',weekdays:JSON.stringify({0:0,1:8,2:8,3:8,4:8,5:8,6:0}),unit:'hours-per-weekday'},
   {id:'w2',personId:'u1',from:'2026-01-01',to:'2026-12-31',weekdays:JSON.stringify({0:0,1:6,2:6,3:6,4:6,5:6,6:0}),unit:'hours-per-weekday'}
  ],
  leave: [{id:'leave1',personId:'u1',from:'2026-03-03',to:'2026-03-03',daily:JSON.stringify([{date:'2026-03-03',hours:'1'}]),unit:'hours-per-day',currency:'USD'}],
  deletions: [{id:'delete1',entity:'allocations',recordId:'a3',sequence:1,auditTimestamp:'2026-03-05T12:00:00Z'}]
 }
 const pkg = packageOf('float', rows, {
  windows:[{from:'2025-01-01',to:'2025-12-31',complete:true},{from:'2026-01-01',to:'2026-12-31',complete:true}],
  units:{time:'hours',allocations:'hours-per-day'},
  deletionCoverage:{complete:true,fromSequence:1,toSequence:1,missed:false},
  financial:{
   'p1/2025-01/USD':control({budgetMinor:100000}),
   'p1/2025-03/USD':control({rawSeconds:3600,billableSeconds:3600,unbilledSeconds:3600,billMinor:15000,costMinor:9000,scheduledSeconds:7200}),
   'p1/2026-03/USD':control({rawSeconds:7200,billableSeconds:7200,unbilledSeconds:7200,billMinor:36000,costMinor:20000,scheduledSeconds:10800}),
   'Unassigned/2026-03/USD':control({leaveSeconds:3600})
  }
 })
 for (const kind of ['allocations','time']) {
  const cfg=pkg.manifest.objects[kind][0]; delete pkg.files[cfg.artifact]
  pkg.manifest.objects[kind]=[2025,2026].map(year=>{
   const artifact=kind+'-'+year+'.csv'
   pkg.files[artifact]=csv(rows[kind].filter(r=>(r.workDate??r.from).startsWith(String(year))))
   return {...structuredClone(cfg),artifact,filters:{from:year+'-01-01',to:year+'-12-31',includeArchived:true},endpoint:kind==='time'?'/logged-time':'/tasks'}
  })
 }
 pkg.manifest.objects.leave[0].endpoint='/timeoffs'
 pkg.files['deletions-repeat.csv']=pkg.files['deletions.csv']
 pkg.manifest.objects.deletions.push({...structuredClone(pkg.manifest.objects.deletions[0]),artifact:'deletions-repeat.csv'})
 return pkg
}
