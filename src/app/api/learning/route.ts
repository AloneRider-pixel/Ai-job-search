import { db } from "@/db";
import { applicationStageEvents } from "@/db/schema";
import { getOutcomeModel, retrainOutcomeModel } from "@/lib/learning/engine";
import { getProfileWithExperiences } from "@/lib/repositories";
import { requireAuth } from "@/lib/auth/guards";

export async function GET(){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({model:null});
    const model=await getOutcomeModel(profile.profile.id);
    return Response.json({model});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load learning model."},{status:503});
  }
}

export async function POST(){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    const model=await retrainOutcomeModel(profile.profile.id);
    return Response.json({model});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to retrain learning model."},{status:503});
  }
}
