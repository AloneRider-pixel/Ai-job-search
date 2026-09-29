import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { applications, interviewQuestions, interviewSessions } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";
import { getInterviewContext } from "@/lib/interview/context";
import { generateInterviewQuestions } from "@/lib/interview/engine";

const createSchema=z.object({
  jobId:z.number().int().positive(),
  applicationId:z.number().int().positive().optional(),
  mode:z.enum(["mixed","technical","behavioral","system_design"]).default("mixed"),
  questionCount:z.number().int().min(3).max(8).default(6)
});

export async function GET(req:NextRequest){
  try{
    const {profile}=await requireProfile();
    const jobIdValue=new URL(req.url).searchParams.get("jobId");
    const jobId=jobIdValue?Number(jobIdValue):null;
    const where=jobId&&Number.isInteger(jobId)
      ?and(eq(interviewSessions.profileId,profile.id),eq(interviewSessions.jobId,jobId))
      :eq(interviewSessions.profileId,profile.id);
    const sessions=await db.select({
      id:interviewSessions.id,jobId:interviewSessions.jobId,status:interviewSessions.status,mode:interviewSessions.mode,
      questionCount:interviewSessions.questionCount,answeredCount:interviewSessions.answeredCount,
      overallScore:interviewSessions.overallScore,readinessScore:interviewSessions.readinessScore,
      summary:interviewSessions.summary,startedAt:interviewSessions.startedAt,completedAt:interviewSessions.completedAt,
    }).from(interviewSessions).where(where).orderBy(desc(interviewSessions.createdAt)).limit(25);
    return Response.json({sessions});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load interview sessions."},{status:503});
  }
}

export async function POST(req:NextRequest){
  try{
    const {profile}=await requireProfile();
    const payload=createSchema.parse(await req.json());
    const context=await getInterviewContext(profile.id,payload.jobId);
    if(!context)return Response.json({error:"Job or candidate profile not found."},{status:404});

    let applicationId:number|null=null;
    if(payload.applicationId){
      const [application]=await db.select({id:applications.id,jobId:applications.jobId}).from(applications).where(and(
        eq(applications.id,payload.applicationId),eq(applications.profileId,profile.id)
      )).limit(1);
      if(!application)return Response.json({error:"Application not found for this profile."},{status:404});
      if(application.jobId!==payload.jobId)return Response.json({error:"Application does not belong to the selected job."},{status:409});
      applicationId=application.id;
    }

    const generated=await generateInterviewQuestions({
      title:context.job.title,company:context.job.company,jd:context.job.description,
      profile:context.profile,gaps:context.gaps,mode:payload.mode,questionCount:payload.questionCount
    });
    const questions=generated.questions.slice(0,payload.questionCount);
    if(questions.length<3)return Response.json({error:"Interview generator returned too few questions."},{status:503});

    const [session]=await db.insert(interviewSessions).values({
      profileId:profile.id,jobId:payload.jobId,applicationId,packageId:context.latestPackage?.id??null,
      status:"active",mode:payload.mode,questionCount:questions.length,answeredCount:0,
      metadata:{generator:generated.mode,model:generated.model,gaps:context.gaps,createdFromPackageId:context.latestPackage?.id??null}
    }).returning();

    await db.insert(interviewQuestions).values(questions.map((q,index)=>({
      sessionId:session.id,sequence:index+1,type:q.type,area:q.area,question:q.question,
      expectedSignals:q.expectedSignals,evidenceContext:q.evidenceContext,isFollowUp:false
    })));

    const [first]=await db.select().from(interviewQuestions).where(eq(interviewQuestions.sessionId,session.id)).orderBy(interviewQuestions.sequence).limit(1);
    return Response.json({
      session:{...session,generator:generated.mode,model:generated.model},
      firstQuestion:first
    },{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid interview session request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to create interview session."},{status:503});
  }
}
