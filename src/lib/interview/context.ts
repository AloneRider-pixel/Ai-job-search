import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationPackages, jobs } from "@/db/schema";
import { getProfileWithExperiences } from "@/lib/repositories";
import type { InterviewProfile } from "@/lib/ai/interview";

export async function getInterviewContext(profileId:number,jobId:number){
  const current=await getProfileWithExperiences(profileId);
  if(!current)return null;
  const [job]=await db.select().from(jobs).where(eq(jobs.id,jobId)).limit(1);
  if(!job)return null;
  const [latestPackage]=await db.select().from(applicationPackages).where(and(
    eq(applicationPackages.profileId,profileId),
    eq(applicationPackages.jobId,jobId)
  )).orderBy(desc(applicationPackages.version)).limit(1);

  const profile:InterviewProfile={
    name:current.profile.name,
    headline:current.profile.headline??undefined,
    summary:current.profile.summary??undefined,
    skills:current.profile.skills??[],
    experience:(current.experiences??[]).map((e)=>({
      title:e.title,company:e.company,bullets:e.bullets??[]
    }))
  };

  const gaps:string[]=[];
  for(const item of (latestPackage?.learningPlan??[])){
    if(item&&typeof item==="object"){
      const gap=(item as {gap?:unknown}).gap;
      if(typeof gap==="string"&&gap.trim())gaps.push(gap.trim());
    }
  }
  for(const item of (latestPackage?.requirementMatrix??[])){
    if(item&&typeof item==="object"){
      const matched=(item as {matched?:unknown}).matched;
      const req=(item as {requirement?:unknown}).requirement;
      if(matched===false&&typeof req==="string"&&req.trim())gaps.push(req.trim());
    }
  }

  return {
    profile,
    job,
    latestPackage:latestPackage??null,
    gaps:[...new Set(gaps)].slice(0,12)
  };
}
