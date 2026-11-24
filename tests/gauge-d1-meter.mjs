// Counts the rows D1 reports reading and writing for each statement the Worker runs, and answers GET /__reads
// (add ?reset=1 to clear). A read-budget test wraps the emitted Worker with it; production code never loads it.
export const meterModule = inner => `import inner from './${inner}'
const log=[];const real=new WeakMap()
function wrap(sql,stmt){
 const p=new Proxy(stmt,{get(t,k){
  if(k==='bind')return (...a)=>wrap(sql,t.bind(...a))
  if(k==='all'||k==='run')return async (...a)=>{const r=await t[k](...a);log.push({sql,read:r.meta?.rows_read,written:r.meta?.rows_written});return r}
  if(k==='first')return async (col)=>{const r=await t.all();log.push({sql,read:r.meta?.rows_read,written:r.meta?.rows_written});const row=r.results[0]??null;return col&&row?row[col]:row}
  if(k==='raw')return async ()=>{const r=await t.all();log.push({sql,read:r.meta?.rows_read,written:r.meta?.rows_written});return r.results.map(x=>Object.values(x))}
  const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}})
 real.set(p,{sql,stmt});return p}
function counting(db){return new Proxy(db,{get(t,k){
 if(k==='prepare')return sql=>wrap(sql,t.prepare(sql))
 if(k==='batch')return async stmts=>{const rs=await t.batch(stmts.map(s=>real.get(s)?.stmt??s));rs.forEach((r,i)=>log.push({sql:real.get(stmts[i])?.sql??'?',read:r.meta?.rows_read,written:r.meta?.rows_written,batch:true}));return rs}
 if(k==='withSession')return (...a)=>counting(t.withSession(...a))
 const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}})}
export default {...inner,
 fetch:(request,env,ctx)=>{const u=new URL(request.url);if(u.pathname==='/__reads'){const out=JSON.stringify(log);if(u.searchParams.get('reset'))log.length=0;return new Response(out)};return inner.fetch(request,{...env,DB:counting(env.DB)},ctx)},
 scheduled:(e,env,ctx)=>inner.scheduled(e,{...env,DB:counting(env.DB)},ctx)}
`
