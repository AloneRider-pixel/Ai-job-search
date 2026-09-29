import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { applicationPackages, applications } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";
import { applicationUpdateSchema } from "@/lib/validation";
import { recordApplicationStageEvent, retrainOutcomeModel } from "@/lib/learning/engine";

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});

    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid application id."},{status:400});
    const payload=applicationUpdateSchema.parse(await req.json());

    const [existing]=await db.select().from(applications).where(and(
      eq(applications.id,id),eq(applications.profileId,profile.profile.id)
    )).limit(1);
    if(!existing)return Response.json({error:"Application not found."},{status:404});

    if(payload.packageId){
      const [pkg]=await db.select({id:applicationPackages.id}).from(applicationPackages).where(and(
        eq(applicationPackages.id,payload.packageId),
        eq(applicationPackages.profileId,profile.profile.id),
        eq(applicationPackages.jobId,existing.jobId)
      )).limit(1);
      if(!pkg)return Response.json({error:"Application package not found for this profile and job."},{status:404});
    }

    const [application]=await db.update(applications).set({...payload,updatedAt:new Date()})
      .where(eq(applications.id,id)).returning();
    if(!application)return Response.json({error:"Application not found."},{status:404});

    if(existing.stage!==application.stage){
      await recordApplicationStageEvent({
        profileId:profile.profile.id,
        applicationId:application.id,
        fromStage:existing.stage,
        toStage:application.stage,
        source:"user"
      });
    }
    await retrainOutcomeModel(profile.profile.id);

    return Response.json({application});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application update.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to update application."},{status:503});
  }
}
