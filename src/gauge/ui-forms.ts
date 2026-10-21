import { type Row, uuid } from './model'
export const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
// Labels sit above their control; the control keeps its public field name.
export const input=(name:string,label:string,value:unknown='',type='text',required=true)=>`<label class="g-field"><span>${escape(label)}</span><input name="${name}" type="${type}" value="${escape(value)}" ${required?'required':''}></label>`
// People enter dollars, hours and minutes; form-input.ts turns the unit-named fields back into cents and seconds.
const amountValue=(minor:unknown)=>{
 if(minor==null||minor==='')return ''
 const value=BigInt(String(minor)),absolute=value<0n?-value:value
 return `${value<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`
}
export const amount=(name:string,label:string,minor:unknown,required=true)=>`<label class="g-field"><span>${escape(label)}</span><input name="${name}" type="text" inputmode="decimal" value="${escape(amountValue(minor))}" ${required?'required':''}></label>`
export const duration=(name:string,label:string,seconds:unknown,per=3600,step='0.25')=>`<label class="g-field"><span>${escape(label)}</span><input name="${name}" type="number" min="0" step="${step}" value="${seconds==null||seconds===''?'':Math.round(Number(seconds)/per*10000)/10000}" required></label>`
export const area=(name:string,label:string,value:unknown='',required=true)=>`<label class="g-field g-field--wide"><span>${escape(label)}</span><textarea name="${name}" rows="3" ${required?'required':''}>${escape(value)}</textarea></label>`
export const select=(name:string,label:string,rows:Row[],selected?:unknown,optional=false)=>`<label class="g-field"><span>${escape(label)}</span><select name="${name}" ${optional?'':'required'}>${optional?'<option value="">None</option>':''}${rows.map(r=>`<option value="${escape(r.id)}" ${selected===r.id?'selected':''}>${escape(r.value.name??r.value.title??r.id)}</option>`).join('')}</select></label>`
/** A select of fixed values, each shown capitalised ("hourly" reads Hourly). */
export const choices=(name:string,label:string,values:string[],selected?:unknown)=>select(name,label,values.map(v=>({id:v,revision:'',value:{name:v.charAt(0).toUpperCase()+v.slice(1)}})),selected)
/** A checkbox per record, for choosing several (assigned people). */
export const checks=(name:string,label:string,rows:Row[],selected:unknown[]=[])=>`<fieldset class="g-checklist g-checks"><legend>${escape(label)}</legend>${rows.map(r=>check(name,r.value.name,selected.includes(r.id),r.id)).join('')||'<p class="g-empty">No people yet.</p>'}</fieldset>`
/** Seven weekday checkboxes posting 0 (Sunday) to 6 (Saturday), Monday first. */
export const weekdayChecks=(selected='1,2,3,4,5')=>`<fieldset class="g-checklist g-weekdays"><legend>Working weekdays</legend>${[1,2,3,4,5,6,0].map(n=>check('weekdays',['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n],selected.split(',').includes(String(n)),String(n))).join('')}</fieldset>`
export const check=(name:string,label:string,checked=false,value?:string)=>`<label class="g-check"><input type="checkbox" name="${name}"${value===undefined?'':` value="${escape(value)}"`} ${checked?'checked':''}><span>${escape(label)}</span></label>`
const hidden=(action:string,row?:Row)=>`<input type="hidden" name="action" value="${escape(action)}"><input type="hidden" name="key" value="${uuid()}">${row?`<input type="hidden" name="id" value="${escape(row.id)}"><input type="hidden" name="revision" value="${escape(row.revision)}">`:''}`
/** A card holding one form: its title, its fields and one primary action. */
export function form(action:string,title:string,fields:string,row?:Row,button='Save',className=''){return `<section class="g-card${className?` ${className}`:''}"><h2>${escape(title)}</h2><form class="g-form" method="post" action="/app/action" enctype="multipart/form-data">${hidden(action,row)}${fields}<div class="g-actions"><button class="g-btn g-btn--primary">${escape(button)}</button></div></form></section>`}
/** One decision on one exact revision. A decision that needs a reason opens its Reason field inline. */
export function decision(action:string,label:string,row:Row,reason=false,tone:'primary'|'secondary'|'quiet'='primary',extra=''){
 const button=`<button class="g-btn g-btn--${reason&&tone==='primary'?'secondary':tone}">${escape(label)}</button>`
 if(!reason)return `<form class="g-decide" method="post" action="/app/action" enctype="multipart/form-data">${hidden(action,row)}${extra}${button}</form>`
 return `<details class="g-reveal"><summary class="g-btn g-btn--${tone==='primary'?'secondary':tone}">${escape(label)}</summary><form class="g-decide g-decide--reason" method="post" action="/app/action" enctype="multipart/form-data">${hidden(action,row)}${input('reason','Reason')}${button}</form></details>`
}
/**
 * One table column. `size` fixes its width where record tables fit the page (from 1024 px); unsized columns share the
 * rest and wrap. `line` places the cell in the phone row (600 px and narrower): 1 the bold primary pair, 2 the muted
 * values and status, 3 a full-width note; a column without a line is left out of the phone row.
 */
export interface Column { label: string; cell: (r: Row) => string; num?: boolean; wrap?: boolean; size?: 'date' | 'num' | 'status' | 'name'; line?: 1 | 2 | 3 }
/** A table of records: one row per record (its id kept on the row for links), readable cells, and the row's actions. */
export function table(title:string,rows:Row[],columns:Column[],actions?:(r:Row)=>string,empty='No records yet.'){
 const fit=columns.some(c=>c.size),phone=columns.some(c=>c.line)
 const classes=(...names:(string|false|undefined)[])=>{const list=names.filter(Boolean).join(' ');return list?` class="${list}"`:''}
 const head=`<tr>${columns.map(c=>`<th scope="col"${classes(c.num&&'g-num',c.size&&`g-col-${c.size}`)}>${escape(c.label)}</th>`).join('')}${actions?`<th scope="col"${classes(fit&&'g-col-actions')}><span class="g-hide">Actions</span></th>`:''}</tr>`
 const body=rows.map(r=>`<tr id="${escape(r.id)}">${columns.map(c=>`<td data-label="${escape(c.label)}"${classes(c.num?'g-num':c.wrap&&'g-wrap',phone&&`g-line-${c.line??0}`)}>${c.cell(r)}</td>`).join('')}${actions?`<td class="g-actions-cell"><div class="g-row-actions">${actions(r)}</div></td>`:''}</tr>`).join('')
 return `<section class="g-card g-card--table"><h2>${escape(title)}</h2>${rows.length?`<div${classes('g-table',fit&&'g-table--fit',phone&&'g-table--rows')}><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`:`<p class="g-empty">${escape(empty)}</p>`}</section>`
}
/** The link that opens a record from a table. */
export const open=(section:string,r:Row,label:unknown)=>`<a class="g-record" href="/app/${section}?edit=${escape(r.id)}">${escape(label)}</a>`
