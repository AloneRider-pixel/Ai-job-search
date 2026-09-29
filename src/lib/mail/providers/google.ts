import { MailConnectionSecrets, NormalizedEmail } from "@/lib/mail/types";

type GoogleTokenResponse={access_token:string;expires_in?:number;refresh_token?:string;scope?:string;error?:string;error_description?:string};

function required(name:string){const value=process.env[name];if(!value)throw new Error(name+" is not configured.");return value;}

async function googleToken(body:Record<string,string>){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body),signal:AbortSignal.timeout(20_000)});
  const data=await response.json() as GoogleTokenResponse;
  if(!response.ok||!data.access_token)throw new Error(data.error_description??"Google token exchange failed.");
  return data;
}

export function googleAuthorizeUrl(state:string){
  const params=new URLSearchParams({
    client_id:required("GOOGLE_CLIENT_ID"),response_type:"code",redirect_uri:required("GOOGLE_REDIRECT_URI"),state,
    access_type:"offline",prompt:"consent",
    scope:["openid","email","https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.send"].join(" ")
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?"+params.toString();
}

export async function exchangeGoogleCode(code:string):Promise<MailConnectionSecrets&{accountId:string;email:string;scopes:string[]}>{
  const data=await googleToken({code,client_id:required("GOOGLE_CLIENT_ID"),client_secret:required("GOOGLE_CLIENT_SECRET"),redirect_uri:required("GOOGLE_REDIRECT_URI"),grant_type:"authorization_code"});
  const userResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:"Bearer "+data.access_token},signal:AbortSignal.timeout(15_000)});
  const user=await userResponse.json() as {sub?:string;email?:string};
  if(!userResponse.ok||!user.sub||!user.email)throw new Error("Unable to resolve Google account identity.");
  return {accessToken:data.access_token,refreshToken:data.refresh_token??null,tokenExpiresAt:new Date(Date.now()+(data.expires_in??3600)*1000),accountId:user.sub,email:user.email,scopes:(data.scope??"").split(" ").filter(Boolean)};
}

export async function refreshGoogleToken(refreshToken:string){
  const data=await googleToken({refresh_token:refreshToken,client_id:required("GOOGLE_CLIENT_ID"),client_secret:required("GOOGLE_CLIENT_SECRET"),grant_type:"refresh_token"});
  return {accessToken:data.access_token,tokenExpiresAt:new Date(Date.now()+(data.expires_in??3600)*1000)};
}

function decodeBase64Url(value:string){return Buffer.from(value,"base64url").toString("utf8");}
function header(headers:Array<{name?:string;value?:string}>,name:string){return headers.find(h=>h.name?.toLowerCase()===name.toLowerCase())?.value??"";}
function emailAddress(value:string){return value.match(/<([^>]+)>/)?.[1]??value;}
function bodyText(payload:any):string{
  if(payload?.body?.data)return decodeBase64Url(payload.body.data);
  for(const part of payload?.parts??[])if(part.mimeType==="text/plain"&&part.body?.data)return decodeBase64Url(part.body.data);
  for(const part of payload?.parts??[])if(part.parts){const nested=bodyText(part);if(nested)return nested;}
  return "";
}

export async function listGoogleMessages(accessToken:string,accountEmail:string,after?:Date):Promise<NormalizedEmail[]>{
  const query=after?"&q="+encodeURIComponent("after:"+Math.floor(after.getTime()/1000)):"";
  const listResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100"+query,{headers:{authorization:"Bearer "+accessToken},signal:AbortSignal.timeout(20_000)});
  if(!listResponse.ok)throw new Error("Gmail message list failed: "+listResponse.status);
  const list=await listResponse.json() as {messages?:Array<{id:string;threadId?:string}>};
  const results:NormalizedEmail[]=[];
  for(const item of list.messages??[]){
    const detailResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=full",{headers:{authorization:"Bearer "+accessToken},signal:AbortSignal.timeout(20_000)});
    if(!detailResponse.ok)continue;
    const detail=await detailResponse.json();
    const headers=detail.payload?.headers??[];
    const fromHeader=header(headers,"From");
    const from=emailAddress(fromHeader);
    const to=header(headers,"To").split(",").map((v:string)=>emailAddress(v.trim())).filter(Boolean);
    const dateValue=header(headers,"Date");
    const at=dateValue?new Date(dateValue):null;
    const direction=from.toLowerCase()===accountEmail.toLowerCase()?"outbound":"inbound";
    results.push({
      providerMessageId:String(detail.id),threadId:String(detail.threadId??item.threadId??""),direction,subject:header(headers,"Subject"),
      fromEmail:from||null,toEmails:to,receivedAt:direction==="inbound"?at:null,sentAt:direction==="outbound"?at:null,
      snippet:String(detail.snippet??""),bodyText:bodyText(detail.payload),
      metadata:{labelIds:detail.labelIds??[],internalDate:detail.internalDate??null,messageId:header(headers,"Message-ID")}
    });
  }
  return results;
}

function mimeBase64Url(to:string,subject:string,body:string){
  const mime=["To: "+to,"Subject: "+subject,"Content-Type: text/plain; charset=UTF-8","MIME-Version: 1.0","",body].join("\r\n");
  return Buffer.from(mime,"utf8").toString("base64url");
}

export async function sendGoogleEmail(accessToken:string,args:{to:string;subject:string;body:string}){
  const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/json"},body:JSON.stringify({raw:mimeBase64Url(args.to,args.subject,args.body)}),signal:AbortSignal.timeout(20_000)});
  const data=await response.json() as {id?:string;threadId?:string;error?:{message?:string}};
  if(!response.ok||!data.id)throw new Error(data.error?.message??"Gmail send failed.");
  return data;
}
