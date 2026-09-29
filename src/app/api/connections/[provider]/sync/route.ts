import { NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth/guards";
import { syncMailbox } from "@/lib/mail/sync";

export async function POST(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  try{
    const {profile}=await requireProfile();
    const provider=(await params).provider;
    if(provider!=="google"&&provider!=="microsoft")return Response.json({error:"Unsupported mailbox provider."},{status:400});
    const result=await syncMailbox(profile.id,provider);
    return Response.json(result);
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Mailbox sync failed."},{status:502});
  }
}
