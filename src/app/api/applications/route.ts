import { NextRequest } from "next/server";
import { createOrUpdateApplication, listApplications, getProfileWithExperiences } from "@/lib/repositories";
import { applicationCreateSchema } from "@/lib/validation";
import { requireAuth } from "@/lib/auth/guards";

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
    const payload=applicationCreateSchema.parse(await req.json());
    const application=await createOrUpdateApplication({...payload,profileId:profile.profile.id});
    return Response.json({application},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to save application."},{status:503});
  }
}
