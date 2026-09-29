import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { interviewAnswers, interviewQuestions, interviewSessions } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";
import { getInterviewContext } from "@/lib/interview/context";

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {profile}=await requireProfile();
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid interview session id."},{status:400});
    const [session]=await db.select().from(interviewSessions).where(and(
      eq(interviewSessions.id,id),eq(interviewSessions.profileId,profile.id)
    )).limit(1);
    if(!session)return Response.json({error:"Interview session not found."},{status:404});

    const [questions,answers]=await Promise.all([
      db.select().from(interviewQuestions).where(eq(interviewQuestions.sessionId,id)).orderBy(interviewQuestions.sequence),
      db.select().from(interviewAnswers).where(eq(interviewAnswers.sessionId,id)).orderBy(desc(interviewAnswers.createdAt))
    ]);
    const context=await getInterviewContext(profile.id,session.jobId);
    const latestAnswers=new Map<number,typeof answers[number]>();
    for(const answer of answers)if(!latestAnswers.has(answer.questionId))latestAnswers.set(answer.questionId,answer);
    return Response.json({
      session,job:context?.job??null,
      questions:questions.map(question=>({...question,latestAnswer:latestAnswers.get(question.id)??null}))
    });
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load interview session."},{status:503});
  }
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {profile}=await requireProfile();
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid interview session id."},{status:400});
    const body=(await req.json()) as {action?:unknown};
    if(body.action!=="complete")return Response.json({error:"Unsupported interview session action."},{status:400});

    const [session]=await db.select().from(interviewSessions).where(and(
      eq(interviewSessions.id,id),eq(interviewSessions.profileId,profile.id)
    )).limit(1);
    if(!session)return Response.json({error:"Interview session not found."},{status:404});
    if(session.status==="completed")return Response.json({session});

    const [questions,answers]=await Promise.all([
      db.select().from(interviewQuestions).where(eq(interviewQuestions.sessionId,id)),
      db.select().from(interviewAnswers).where(eq(interviewAnswers.sessionId,id)).orderBy(desc(interviewAnswers.createdAt))
    ]);
    const latest=new Map<number,typeof answers[number]>();
    for(const answer of answers)if(!latest.has(answer.questionId))latest.set(answer.questionId,answer);
    const unanswered=questions.filter(q=>!latest.has(q.id));
    if(unanswered.length)return Response.json({
      error:"Finish every interview question before completing the session.",
      unansweredCount:unanswered.length
    },{status:409});

    const scores=questions.map(q=>latest.get(q.id)!.score);
    const overallScore=scores.length?Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length):0;
    const strengths=[...new Set(questions.flatMap(q=>latest.get(q.id)?.strengths??[]))].slice(0,6);
    const gaps=[...new Set(questions.flatMap(q=>latest.get(q.id)?.gaps??[]))].slice(0,6);
    const summary=overallScore>=85
      ?"Strong practice session. Keep the structure and add role-specific evidence where useful."
      :overallScore>=70
      ?"Solid practice session. Focus next on the recurring gaps below and make answers more concrete."
      :overallScore>=55
      ?"Mixed practice session. Rehearse the weak areas with tighter reasoning, trade-offs, and validation."
      :"Practice session shows material gaps. Repeat the weak questions after targeted preparation.";

    const readinessScore=Math.max(0,Math.min(100,Math.round(overallScore*.8+(questions.length?Math.min(100,questions.length/6*100)*.2:0))));
    const [updated]=await db.update(interviewSessions).set({
      status:"completed",answeredCount:questions.length,overallScore,readinessScore,summary,
      strengths,gaps,completedAt:new Date(),updatedAt:new Date()
    }).where(eq(interviewSessions.id,id)).returning();
    return Response.json({session:updated});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to complete interview session."},{status:503});
  }
}
