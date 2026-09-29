import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { recruiterContacts } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

type HunterVerification={status?:string;score?:number;regexp?:boolean;gibberish?:boolean;disposable?:boolean;webmail?:boolean;smtp_check?:boolean;mx_records?:boolean};

const schema=z.object({confirm:z.literal(true)});

function required(name:string){const value=process.env[name];if(!value)throw new Error(name+" is not configured.");return value;}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {profile}=await requireProfile();
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid contact id."},{status:400});
    schema.parse(await req.json());

    const [contact]=await db.select().from(recruiterContacts).where(and(
      eq(recruiterContacts.id,id),eq(recruiterContacts.profileId,profile.id)
    )).limit(1);
    if(!contact)return Response.json({error:"Contact not found."},{status:404});
    if(!contact.email)return Response.json({error:"This contact has no email to verify."},{status:409});
    if(!process.env.HUNTER_API_KEY)return Response.json({error:"HUNTER_API_KEY is required for email re-verification."},{status:503});

    const response=await fetch("https://api.hunter.io/v2/email-verifier?"+new URLSearchParams({
      email:contact.email,
      api_key:required("HUNTER_API_KEY")
    }).toString(),{headers:{accept:"application/json"},signal:AbortSignal.timeout(25_000),cache:"no-store"});
    const payload=await response.json() as {data?:HunterVerification};
    if(!response.ok)return Response.json({error:"Hunter email verification failed.",status:response.status},{status:502});

    const verification=payload.data??{};
    const state=verification.status==="valid"?"verified":verification.status==="invalid"?"invalid":"unverified";
    const evidence=[
      ...(Array.isArray(contact.evidence)?contact.evidence:[]),
      {provider:"hunter_email_verifier",email:contact.email,status:verification.status??"unknown",score:verification.score??null,smtpCheck:verification.smtp_check??null,mxRecords:verification.mx_records??null,recheckedAt:new Date().toISOString()}
    ];
    const [updated]=await db.update(recruiterContacts).set({
      verificationState:state,
      confidence:state==="verified"?Math.max(contact.confidence,75):contact.confidence,
      lastVerifiedAt:state==="verified"?new Date():contact.lastVerifiedAt,
      evidence:evidence.slice(-20),
      updatedAt:new Date()
    }).where(eq(recruiterContacts.id,id)).returning();

    return Response.json({contact:updated,verification:{status:verification.status??"unknown",score:verification.score??null}});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid verification request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Email verification failed."},{status:502});
  }
}
