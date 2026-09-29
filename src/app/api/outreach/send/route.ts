import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { applications, outreachMessages, profiles, recruiterContacts } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getAnyConnection, getValidSecrets } from "@/lib/mail/connection";
import { sendGoogleEmail } from "@/lib/mail/providers/google";
import { sendMicrosoftEmail } from "@/lib/mail/providers/microsoft";

const schema=z.object({contactId:z.number().int().positive(),applicationId:z.number().int().positive().optional().nullable(),subject:z.string().min(1).max(180),body:z.string().min(10).max(10000),confirm:z.literal(true)});

export async function POST(req:NextRequest){
  try{
    const current=await requireAuth();
    const payload=schema.parse(await req.json());
    const [profile]=await db.select().from(profiles).where(eq(profiles.userId,current.user.id)).limit(1);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    const [contact]=await db.select().from(recruiterContacts).where(and(eq(recruiterContacts.id,payload.contactId),eq(recruiterContacts.profileId,profile.id))).limit(1);
    if(!contact)return Response.json({error:"Contact not found."},{status:404});
    if(contact.verificationState!=="verified"||!contact.email)return Response.json({error:"Contact email must be verified before sending."},{status:409});
    if(payload.applicationId){
      const [application]=await db.select({id:applications.id}).from(applications).where(and(eq(applications.id,payload.applicationId),eq(applications.profileId,profile.id))).limit(1);
      if(!application)return Response.json({error:"Application not found."},{status:404});
    }

    const connection=await getAnyConnection(profile.id);
    if(!connection)return Response.json({error:"Connect Gmail or Outlook before sending."},{status:409});
    const {accessToken}=await getValidSecrets(connection);
    const result=connection.provider==="google"
      ? await sendGoogleEmail(accessToken,{to:contact.email,subject:payload.subject,body:payload.body})
      : await sendMicrosoftEmail(accessToken,{to:contact.email,subject:payload.subject,body:payload.body});

    const [message]=await db.insert(outreachMessages).values({
      profileId:profile.id,applicationId:payload.applicationId??null,contactId:contact.id,channel:"email",status:"sent",subject:payload.subject,body:payload.body,
      providerMessageId:"id" in result?String(result.id):null,sentAt:new Date(),metadata:{provider:connection.provider,manualApproval:true}
    }).returning();

    return Response.json({message,provider:connection.provider});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid send request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Email send failed."},{status:502});
  }
}
