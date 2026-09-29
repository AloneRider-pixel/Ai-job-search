import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { recruiterContacts } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

const schema=z.object({action:z.enum(["approve","reject"])});

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {profile}=await requireProfile();
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid contact id."},{status:400});
    const payload=schema.parse(await req.json());

    const [contact]=await db.select().from(recruiterContacts).where(and(
      eq(recruiterContacts.id,id),
      eq(recruiterContacts.profileId,profile.id)
    )).limit(1);
    if(!contact)return Response.json({error:"Contact not found."},{status:404});

    if(payload.action==="approve"&&!contact.email&&!contact.profileUrl){
      return Response.json({error:"Only contacts with an email or professional profile can be approved."},{status:409});
    }

    const [updated]=await db.update(recruiterContacts).set({
      approvalState:payload.action==="approve"?"approved":"rejected",
      updatedAt:new Date()
    }).where(eq(recruiterContacts.id,id)).returning();

    return Response.json({contact:updated});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid contact action.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to update contact."},{status:503});
  }
}
