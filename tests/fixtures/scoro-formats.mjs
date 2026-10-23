import * as XLS from '@e965/xlsx'
export const csvRows=source=>source.trimEnd().split('\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m=>m[1].replaceAll('""','"')))
export function inFormat(pkg,kind,format,{version='v2',pages=1}={}){
 const p=structuredClone(pkg),cfg=p.manifest.objects[kind][0],matrix=csvRows(p.files[cfg.artifact]),[header,...values]=matrix;delete p.files[cfg.artifact]
 if(format==='json'){
  cfg.format='json';cfg.apiVersion=version;cfg.array='data';cfg.pagination={page:'page',next:'next',total:'total'};cfg.pages=[]
  for(let i=0;i<pages;i++){const artifact=`${kind}-${i+1}.json`,data=values.filter((_,n)=>n%pages===i).map(row=>Object.fromEntries(header.map((k,j)=>[k,row[j]])));p.files[artifact]=JSON.stringify({data,page:i+1,next:i+1<pages?'page-'+(i+2):null,total:pages});cfg.pages.push({artifact,cursor:'page-'+(i+1)})}
  delete cfg.artifact
 }else{
  const book=XLS.utils.book_new(),sheet=XLS.utils.aoa_to_sheet(matrix);XLS.utils.book_append_sheet(book,sheet,'Source rows');const artifact=kind+'.'+format;p.files[artifact]=XLS.write(book,{type:'buffer',bookType:format==='xls'?'biff8':'xlsx'}).toString('base64');cfg.format=format;cfg.artifact=artifact;cfg.worksheet='Source rows'
 }
 return p
}
// A real BIFF FORMULA record, rather than a writer's cached numeric cell. The
// writer does not emit formula bytecode for legacy XLS, so retain the CFB and
// replace one numeric record with the original cached value plus BIFF tokens.
export function legacyFormula(pkg,kind='time'){
 const p=inFormat(pkg,kind,'xls'),book=XLS.read(Buffer.from(p.files[kind+'.xls'],'base64'),{type:'buffer'});book.Sheets['Source rows'].F2={t:'n',v:7200};const bytes=XLS.write(book,{type:'buffer',bookType:'biff8'}),cfb=XLS.CFB.read(bytes,{type:'buffer'}),entry=XLS.CFB.find(cfb,'Workbook'),stream=Buffer.from(entry.content),chunks=[];let replaced=false
 for(let at=0;at<stream.length;){const code=stream.readUInt16LE(at),size=stream.readUInt16LE(at+2),end=at+4+size,data=stream.subarray(at+4,end);if(code===0x0203&&data.readUInt16LE(0)===1&&data.readUInt16LE(2)===5){const body=Buffer.alloc(29);data.subarray(0,14).copy(body);body.writeUInt16LE(7,20);Buffer.from([0x1e,1,0,0x1e,1,0,0x03]).copy(body,22);const head=Buffer.alloc(4);head.writeUInt16LE(0x0006,0);head.writeUInt16LE(body.length,2);chunks.push(head,body);replaced=true}else chunks.push(stream.subarray(at,end));at=end}
 if(!replaced)throw Error('Synthetic XLS numeric cell was not found');entry.content=Buffer.concat(chunks);entry.size=entry.content.length;p.files[kind+'.xls']=Buffer.from(XLS.CFB.write(cfb,{type:'buffer'})).toString('base64');return p
}
