import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { recruiterContacts } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

const schema=z.object({
  company:z.string().min(1).max(240),
  name:z.string().max(180).optional().nullable(),
  role:z.string().max(180).optional().nullable(),
  profileUrl:z.string().url().optional().nullable(),
  email:z.string().email().max(320).optional().nullable(),
  source:z.string().max(120).optional().nullable(),
  evidence:z.array(z.record(z.string(),z.unknown())).max(20).default([])
});

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const contacts=await db.select().from(recruiterContacts).where(eq(recruiterContacts.profileId,profile.id)).orderBy(desc(recruiterContacts.updatedAt));
    return Response.json({contacts});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load contacts."},{status:503});
  }
}

export async function POST(req:NextRequest){
  try{
    const {profile}=await requireProfile();
    const payload=schema.parse(await req.json());
    const [contact]=await db.insert(recruiterContacts).values({...payload,profileId:profile.id,verificationState:"unverified",confidence:0}).returning();
    return Response.json({contact},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid contact data.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to save contact."},{status:503});
  }
}
