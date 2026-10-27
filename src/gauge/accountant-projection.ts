// Reviewed accounting evidence retains source identity and amounts; commercial inputs stay private.
const commercialKeys=new Set(['financeReviewNote','markupBasisPoints','clientRecoveryMinor','fx','unitRate'])
export function accountantProjection<T>(value:T):T {
 if(Array.isArray(value))return value.map(item=>accountantProjection(item)) as T
 if(value&&typeof value==='object'){
  const object=value as Record<string,unknown>
  return Object.fromEntries(Object.entries(object).filter(([key])=>!commercialKeys.has(key)).map(([key,item])=>{
   const projected=accountantProjection(item)
   if(key==='details'&&object.sourceKind==='expenses'&&projected&&typeof projected==='object'){
    const {reviewNote,...details}=projected as Record<string,unknown>
    return [key,details]
   }
   return [key,projected]
  })) as T
 }
 return value
}
