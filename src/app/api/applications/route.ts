import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { applicationPackages, applications, jobs } from "@/db/schema";
import { db } from "@/db";
import { createOrUpdateApplication, listApplications, getProfileWithExperiences } from "@/lib/repositories";
import { applicationCreateSchema } from "@/lib/validation";
import { requireAuth } from "@/lib/auth/guards";
import { recordApplicationStageEvent, retrainOutcomeModel } from "@/lib/learning/engine";

export async function GET(){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    return Response.json({applications:await listApplications(profile.profile.id)});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load applications."},{status:503});
  }
}

export async function POST(req:NextRequest){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    const payload=applicationCreateSchema.omit({profileId:true}).parse(await req.json());

    const [job]=await db.select({id:jobs.id}).from(jobs).where(eq(jobs.id,payload.jobId)).limit(1);
    if(!job)return Response.json({error:"Job not found."},{status:404});

    if(payload.packageId){
      const [pkg]=await db.select({id:applicationPackages.id}).from(applicationPackages).where(and(
        eq(applicationPackages.id,payload.packageId),
        eq(applicationPackages.profileId,profile.profile.id),
        eq(applicationPackages.jobId,payload.jobId)
      )).limit(1);
      if(!pkg)return Response.json({error:"Application package not found for this profile and job."},{status:404});
    }

    const [existing]=await db.select({id:applications.id,stage:applications.stage}).from(applications).where(and(
      eq(applications.profileId,profile.profile.id),eq(applications.jobId,payload.jobId)
    )).limit(1);

    const application=await createOrUpdateApplication({...payload,profileId:profile.profile.id});
    if(!existing){
      await recordApplicationStageEvent({
        profileId:profile.profile.id,applicationId:application.id,fromStage:null,toStage:application.stage,source:"user",
        metadata:{event:"application_created"}
      });
    }else if(existing.stage!==application.stage){
      await recordApplicationStageEvent({
        profileId:profile.profile.id,applicationId:application.id,fromStage:existing.stage,toStage:application.stage,source:"user"
      });
    }
    await retrainOutcomeModel(profile.profile.id);

    return Response.json({application},{status:existing?200:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to save application."},{status:503});
  }
}
