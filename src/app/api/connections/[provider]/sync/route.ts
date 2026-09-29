import { NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth/guards";
import { syncMailbox } from "@/lib/mail/sync";
import { db } from "@/db";
import { mailboxConnections } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  try{
    const {profile}=await requireProfile();
    const provider=(await params).provider;
    if(provider!=="google"&&provider!=="microsoft")return Response.json({error:"Unsupported mailbox provider."},{status:400});
    const result=await syncMailbox(profile.id,provider);
    await db.update(mailboxConnections).set({
      nextSyncAt:new Date(Date.now()+15*60*1000),
      syncFailureCount:0,
      syncLeaseUntil:null,
      lastError:null,
      updatedAt:new Date()
    }).where(and(eq(mailboxConnections.profileId,profile.id),eq(mailboxConnections.provider,provider)));
    return Response.json(result);
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Mailbox sync failed."},{status:502});
  }
}
