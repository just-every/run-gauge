// Keep SQLite's transaction fences on the same clock as the test Worker.
// Statements remain native D1 statements, including bind(), batch() and rollback.
export function clockDatabase(database,timestamp){
 const instant=new Date(timestamp).toISOString()
 // Skip SQL strings, quoted identifiers and comments: fixture data is not SQL.
 const clockSql=sql=>sql.replace(/('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/)|\bunixepoch\s*\(\s*'subsec'\s*\)/gi,
  (match,quoted)=>quoted??`unixepoch('${instant}','subsec')`)
 return new Proxy(database,{get(target,key){
  if(key==='prepare'||key==='exec')return (sql,...args)=>target[key](clockSql(sql),...args)
  if(key==='withSession')return (...args)=>clockDatabase(target.withSession(...args),timestamp)
  const value=Reflect.get(target,key,target)
  return typeof value==='function'?value.bind(target):value
 }})
}
