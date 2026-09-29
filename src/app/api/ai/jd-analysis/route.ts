import { NextRequest } from "next/server";
import { z } from "zod";
import { buildAIApplicationPackage } from "@/lib/ai/application-package";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";

const requestSchema=z.object({
  title:z.string().min(1).max(240),
  company:z.string().min(1).max(240),
  jd:z.string().min(40).max(60000),
});

function experienceYears(experiences:Array<{startDate:Date|null;endDate:Date|null}>){
  const months=experiences.reduce((sum,e)=>{
    const start=e.startDate?.getTime();
    const end=(e.endDate??new Date()).getTime();
    if(!start)return sum;
    return sum+Math.max(0,Math.round((end-start)/(30.44*24*60*60*1000)));
  },0);
  return Math.min(60,Math.round(months/12*10)/10);
}

export async function POST(req:NextRequest){
  try{
    const current=await requireAuth();
    const data=await getProfileWithExperiences(current.user.id);
    if(!data)return Response.json({error:"Profile not found."},{status:404});
    const payload=requestSchema.parse(await req.json());

    const result=await buildAIApplicationPackage({
      title:payload.title,
      company:payload.company,
      jd:payload.jd,
      profile:{
        name:data.profile.name,
        headline:data.profile.headline??undefined,
        experienceYears:experienceYears(data.experiences),
        skills:data.profile.skills,
        summary:data.profile.summary??undefined,
        experience:data.experiences.map(e=>({title:e.title,company:e.company,bullets:e.bullets}))
      }
    });
    return Response.json({ai:result.data,model:result.model,generatedAt:new Date().toISOString()});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid JD analysis payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"AI analysis failed."},{status:503});
  }
}
