import {readFile} from 'node:fs/promises'

export async function forecastPackage() {
 const root=new URL('./harvest/',import.meta.url),files={}
 for(const name of ['clients.csv','people.csv','projects.csv','time.csv'])files[name]=await readFile(new URL(name,root),'utf8')
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))
 manifest.namespace='synthetic-forecast'
 manifest.schedulePeople={'Synthetic person':'p-1'}
 manifest.scheduleProjects={'Synthetic client/Synthetic project':'j-1'}
 manifest.schedulePeriods={Week:{from:'2026-11-02',to:'2026-11-08',workingDays:5,workingDates:['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']}}
 files['forecast.csv']='Person,Client,Project,Week\nSynthetic person,Synthetic client,Synthetic project,20\n'
 return {manifest,files}
}

export async function capturedForecastPackage() {
 const pack=await forecastPackage()
 delete pack.files['forecast.csv']
 for(const name of ['people.csv','clients.csv','projects.csv'])pack.files[name]=pack.files[name].replaceAll('Synthetic person','Maya Chen').replaceAll('Synthetic client','Lumen Studio').replaceAll('Synthetic project','Northstar website')
 pack.manifest.schedulePeople['person-7']='p-1'
 pack.manifest.scheduleProjects['project-9']='j-1'
 pack.manifest.schedulePlaceholders={'placeholder-2':'Unfilled designer'}
 pack.manifest.forecastApi={authorized:true,durationUnit:'seconds',leaveProjectIds:['time-off'],allocations:{
  a1:[{date:'2026-11-02',seconds:18000},{date:'2026-11-03',seconds:18000},{date:'2026-11-05',seconds:18000},{date:'2026-11-06',seconds:18000}],
  a2:[{date:'2026-11-05',seconds:7200}]
 }}
 pack.files['forecast.json']=JSON.stringify({
  people:[{id:'person-7',name:'Maya Chen'},{id:'placeholder-2',name:'Unfilled designer'}],
  projects:[{id:'project-9',name:'Northstar website'},{id:'time-off',name:'Time Off'}],
  assignments:[
   {id:'a1',personId:'person-7',projectId:'project-9',from:'2026-11-02',to:'2026-11-08',totalSeconds:72000,commitment:'committed'},
   {id:'a2',personId:'person-7',projectId:'time-off',from:'2026-11-05',to:'2026-11-05',totalSeconds:7200,commitment:'committed'},
   {id:'a3',personId:'placeholder-2',projectId:'project-9',from:'2026-11-02',to:'2026-11-08',totalSeconds:36000,commitment:'tentative'}
  ],
  availability:[{id:'v1',personId:'person-7',from:'2026-11-02',to:'2026-11-08',dailySeconds:28800,weekdays:'1,2,3,4,5',holidays:['2026-11-04']}]
 })
 return pack
}
