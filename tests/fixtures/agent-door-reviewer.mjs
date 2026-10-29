export default async function({request,origin,email,owner,mail}){
 const invited=await request(origin+'/auth/invite',{method:'POST',headers:{Origin:origin,Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({email,displayName:'Agency preparation agent',role:'member'})})
 if(invited.status!==202)throw Error('Native invitation refused')
 const messages=mail.read({limit:10}),message=messages.at(-1)
 const address=message?.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)?.[0]
 if(!address)throw Error('Native invitation unavailable')
 const link=new URL(address)
 return request(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:link.searchParams.get('token')})})
}
