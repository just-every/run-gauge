import * as XLS from '@e965/xlsx'
export const csvRows=source=>source.trimEnd().split('\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m=>m[1].replaceAll('""','"')))
export function inFormat(pkg,kind,format,{version='v2',pages=1}={}){
 const p=structuredClone(pkg),cfg=p.manifest.objects[kind][0],matrix=csvRows(p.files[cfg.artifact]),[header,...values]=matrix;delete p.files[cfg.artifact]
 if(format==='json'){
  cfg.format='json';cfg.apiVersion=version;cfg.array='data';cfg.pagination={page:'page',next:'next',total:'total'};cfg.pages=[]
  for(let i=0;i<pages;i++){const artifact=`${kind}-${i+1}.json`,data=values.filter((_,n)=>n%pages===i).map(row=>Object.fromEntries(header.map((k,j)=>[k,row[j]])));p.files[artifact]=JSON.stringify({data,page:i+1,next:i+1<pages?'page-'+(i+2):null,total:pages});cfg.pages.push({artifact,token:'page-'+(i+1)})}
  delete cfg.artifact
 }else{
  const book=XLS.utils.book_new(),sheet=XLS.utils.aoa_to_sheet(matrix);XLS.utils.book_append_sheet(book,sheet,'Source rows');const artifact=kind+'.'+format;p.files[artifact]=XLS.write(book,{type:'buffer',bookType:format==='xls'?'biff8':'xlsx'}).toString('base64');cfg.format=format;cfg.artifact=artifact;cfg.worksheet='Source rows'
 }
 return p
}
