import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getProfileWithExperiences } from "@/lib/repositories";
import { requireAuth } from "@/lib/auth/guards";
import { getLearningAdjustment, getOutcomeModel } from "@/lib/learning/engine";
import { getCalibrationAdjustment, getRankingCalibration } from "@/lib/learning/calibration";
import { jobUpsertSchema } from "@/lib/validation";

function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9+#.]/g," ").replace(/\s+/g," ").trim();}
function baseScoreJob(title:string,description:string,skills:string[],targetRoles:string[]){
  const hay=normalize(title+" "+description);
  const matched=skills.filter(skill=>hay.includes(normalize(skill)));
  const role=targetRoles.length?targetRoles.some(r=>normalize(title).includes(normalize(r))):false;
  const skillScore=skills.length?matched.length/skills.length:0;
  return Math.max(0,Math.min(100,Math.round(skillScore*80+(role?20:10))));
}

export async function GET(req: NextRequest) {
  try {
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({jobs:[]});
    const limit=Number(new URL(req.url).searchParams.get("limit")??50);
    const rows=await db.select().from(jobs).where(eq(jobs.isActive,true)).orderBy(desc(jobs.postedAt)).limit(Math.min(Number.isFinite(limit)?limit:50,100));
    const [model,calibration]=await Promise.all([
      getOutcomeModel(profile.profile.id),
      getRankingCalibration(profile.profile.id)
    ]);

    const scored=rows.map(job=>{
      const baseScore=baseScoreJob(job.title,job.description,profile.profile.skills??[],profile.profile.targetRoles??[]);
      const learned=getLearningAdjustment(model,job,baseScore);
      const calibrated=getCalibrationAdjustment(calibration,job,baseScore);
      return {
        ...job,
        score:calibrated.calibratedScore,
        baseScore,
        learningAdjustment:learned.adjustment,
        learningSignals:learned.signals,
        learningModelVersion:learned.modelVersion,
        calibrationAdjustment:calibrated.adjustment,
        calibrationConfidence:calibrated.confidence,
        calibrationSignals:calibrated.signals,
        calibrationModelVersion:calibrated.modelVersion,
        calibrationIndex:calibrated.calibrationIndex
      };
    }).sort((a,b)=>b.score-a.score);
    return Response.json({ jobs:scored, learningModel:model?{version:model.version,sampleCount:model.sampleCount}:null, rankingCalibration:calibration?{version:calibration.version,sampleCount:calibration.sampleCount}:null });
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load jobs."},{status:503});
  }
}

export async function POST(req:NextRequest){
  try{
    await requireAuth();
    const payload=jobUpsertSchema.parse(await req.json());
    const existing=await db.select({id:jobs.id}).from(jobs).where(and(eq(jobs.source,payload.source),eq(jobs.externalId,payload.externalId))).limit(1);
    if(existing[0]){
      const [job]=await db.update(jobs).set({...payload,updatedAt:new Date()}).where(eq(jobs.id,existing[0].id)).returning();
      return Response.json({job});
    }
    const [job]=await db.insert(jobs).values(payload).returning();
    return Response.json({job},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid job payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to save job."},{status:503});
  }
}
