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
