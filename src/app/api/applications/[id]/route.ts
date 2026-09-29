import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";
import { applicationUpdateSchema } from "@/lib/validation";

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid application id."},{status:400});
    const payload=applicationUpdateSchema.parse(await req.json());
    const [application]=await db.update(applications).set({...payload,updatedAt:new Date()})
      .where(and(eq(applications.id,id),eq(applications.profileId,profile.profile.id))).returning();
    if(!application)return Response.json({error:"Application not found."},{status:404});
    return Response.json({application});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application update.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to update application."},{status:503});
  }
}
