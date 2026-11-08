// Keep SQLite's transaction fences on the same clock as the test Worker.
// Statements remain native D1 statements, including bind(), batch() and rollback.
export function clockDatabase(database,timestamp){
 const instant=new Date(timestamp).toISOString()
 // Skip SQL strings, quoted identifiers and comments: fixture data is not SQL.
 const quotedSql=/('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/)/.source
 const dateCall=String.raw`\b(?:(?:date|time|datetime|julianday|unixepoch)\s*\(\s*|strftime\s*\(\s*'(?:''|[^'])*'\s*,\s*)`
 const token=new RegExp(String.raw`${quotedSql}|(${dateCall})(?:'now'|(?=\)))|(${dateCall})'(subsec(?:ond)?)'|\b(strftime\s*\(\s*'(?:''|[^'])*'\s*)(?=\))|\b(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)\b`,'gi')
 const clockSql=sql=>sql.replace(token,(match,quoted,now,subsec,precision,format,current)=>{
  if(quoted)return quoted
  if(now)return `${now}'${instant}'`
  if(subsec)return `${subsec}'${instant}','${precision}'`
  if(format)return `${format},'${instant}'`
  const fn={current_timestamp:'datetime',current_date:'date',current_time:'time'}[current.toLowerCase()]
  return `${fn}('${instant}')`
 })
 return new Proxy(database,{get(target,key){
  if(key==='prepare'||key==='exec')return (sql,...args)=>target[key](clockSql(sql),...args)
  if(key==='withSession')return (...args)=>clockDatabase(target.withSession(...args),timestamp)
  const value=Reflect.get(target,key,target)
  return typeof value==='function'?value.bind(target):value
 }})
}
