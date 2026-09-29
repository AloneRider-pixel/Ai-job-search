import { MailConnectionSecrets, NormalizedEmail } from "@/lib/mail/types";

type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string;error_description?:string};
function required(name:string){const value=process.env[name];if(!value)throw new Error(name+" is not configured.");return value;}
async function tokenRequest(body:Record<string,string>){
  const tenant=process.env.MICROSOFT_TENANT_ID??"common";
  const response=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body),signal:AbortSignal.timeout(20_000)});
  const data=await response.json() as TokenResponse;
  if(!response.ok||!data.access_token)throw new Error(data.error_description??"Microsoft token request failed.");
  return data;
}
export function microsoftAuthorizeUrl(state:string){
  const params=new URLSearchParams({client_id:required("MICROSOFT_CLIENT_ID"),response_type:"code",redirect_uri:required("MICROSOFT_REDIRECT_URI"),response_mode:"query",state,scope:["openid","profile","email","offline_access","Mail.Read","Mail.Send"].join(" ")});
  return "https://login.microsoftonline.com/"+encodeURIComponent(process.env.MICROSOFT_TENANT_ID??"common")+"/oauth2/v2.0/authorize?"+params.toString();
}
export async function exchangeMicrosoftCode(code:string):Promise<MailConnectionSecrets&{accountId:string;email:string;scopes:string[]}>{
  const data=await tokenRequest({client_id:required("MICROSOFT_CLIENT_ID"),client_secret:required("MICROSOFT_CLIENT_SECRET"),code,redirect_uri:required("MICROSOFT_REDIRECT_URI"),grant_type:"authorization_code",scope:["openid","profile","email","offline_access","Mail.Read","Mail.Send"].join(" ")});
  const meResponse=await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",{headers:{authorization:"Bearer "+data.access_token},signal:AbortSignal.timeout(15_000)});
  const me=await meResponse.json() as {id?:string;mail?:string;userPrincipalName?:string};
  if(!meResponse.ok||!me.id)throw new Error("Unable to resolve Microsoft account identity.");
  return {accessToken:data.access_token,refreshToken:data.refresh_token??null,tokenExpiresAt:new Date(Date.now()+(data.expires_in??3600)*1000),accountId:me.id,email:me.mail??me.userPrincipalName??"",scopes:(data.scope??"").split(" ").filter(Boolean)};
}
export async function refreshMicrosoftToken(refreshToken:string){
  const data=await tokenRequest({client_id:required("MICROSOFT_CLIENT_ID"),client_secret:required("MICROSOFT_CLIENT_SECRET"),refresh_token:refreshToken,grant_type:"refresh_token",scope:["openid","profile","email","offline_access","Mail.Read","Mail.Send"].join(" ")});
  return {accessToken:data.access_token!,refreshToken:data.refresh_token??refreshToken,tokenExpiresAt:new Date(Date.now()+(data.expires_in??3600)*1000)};
}
function stripHtml(value:string){return value.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}

export async function listMicrosoftMessages(accessToken:string,accountEmail:string,after?:Date):Promise<NormalizedEmail[]>{
  const filter=after?"&$filter="+encodeURIComponent("receivedDateTime ge "+after.toISOString()):"";
  let url="https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,body,conversationId,internetMessageId,isDraft"+filter;
  const results:NormalizedEmail[]=[];
  let pages=0;
  while(url&&pages<5){
    const response=await fetch(url,{headers:{authorization:"Bearer "+accessToken,prefer:"outlook.body-content-type=\"text\""},signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw new Error("Microsoft Graph mail sync failed: "+response.status);
    const data=await response.json() as {value?:any[];["@odata.nextLink"]?:string};
    for(const item of data.value??[]){
      const fromEmail=String(item.from?.emailAddress?.address??"");
      const toEmails=(item.toRecipients??[]).map((r:any)=>String(r.emailAddress?.address??"")).filter(Boolean);
      const received=item.receivedDateTime?new Date(item.receivedDateTime):null;
      const sent=item.sentDateTime?new Date(item.sentDateTime):null;
      const direction=fromEmail.toLowerCase()===accountEmail.toLowerCase()?"outbound":"inbound";
      results.push({
        providerMessageId:String(item.id),threadId:String(item.conversationId??""),direction,subject:String(item.subject??""),
        fromEmail:fromEmail||null,toEmails,receivedAt:direction==="inbound"?received:null,sentAt:direction==="outbound"?sent:null,
        snippet:String(item.bodyPreview??""),bodyText:stripHtml(String(item.body?.content??item.bodyPreview??"")),
        metadata:{internetMessageId:item.internetMessageId??null,isDraft:Boolean(item.isDraft)}
      });
    }
    url=data["@odata.nextLink"]??"";pages++;
  }
  return results;
}
export async function sendMicrosoftEmail(accessToken:string,args:{to:string;subject:string;body:string}){
  const response=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/json"},body:JSON.stringify({message:{subject:args.subject,body:{contentType:"Text",content:args.body},toRecipients:[{emailAddress:{address:args.to}}]},saveToSentItems:true}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(String(data?.error?.message??"Microsoft email send failed."));}
  return {accepted:true};
}
