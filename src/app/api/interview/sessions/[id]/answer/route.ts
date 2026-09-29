import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { interviewAnswers, interviewQuestions, interviewSessions } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";
import { getInterviewContext } from "@/lib/interview/context";
import { evaluateInterviewAnswer, generateAdaptiveFollowUp, type InterviewQuestionDraft } from "@/lib/interview/engine";

const schema=z.object({questionId:z.number().int().positive(),answer:z.string().min(10).max(12000)});

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {profile}=await requireProfile();
    const sessionId=Number((await params).id);
    if(!Number.isInteger(sessionId)||sessionId<=0)return Response.json({error:"Invalid interview session id."},{status:400});
    const payload=schema.parse(await req.json());

    const [session]=await db.select().from(interviewSessions).where(and(
      eq(interviewSessions.id,sessionId),eq(interviewSessions.profileId,profile.id)
    )).limit(1);
    if(!session)return Response.json({error:"Interview session not found."},{status:404});
    if(session.status==="completed")return Response.json({error:"Interview session is already completed."},{status:409});

    const [question]=await db.select().from(interviewQuestions).where(and(
      eq(interviewQuestions.id,payload.questionId),eq(interviewQuestions.sessionId,sessionId)
    )).limit(1);
    if(!question)return Response.json({error:"Interview question not found."},{status:404});

    const context=await getInterviewContext(profile.id,session.jobId);
    if(!context)return Response.json({error:"Interview context is no longer available."},{status:404});

    const questionForEvaluation:InterviewQuestionDraft={
      type:question.type as InterviewQuestionDraft["type"],
      area:question.area,question:question.question,
      expectedSignals:question.expectedSignals??[],evidenceContext:question.evidenceContext??[]
    };
    const evaluation=await evaluateInterviewAnswer({
      title:context.job.title,company:context.job.company,question:questionForEvaluation,
      answer:payload.answer,profile:context.profile
    });

    const [lastAttempt]=await db.select({attempt:interviewAnswers.attempt}).from(interviewAnswers)
      .where(eq(interviewAnswers.questionId,question.id)).orderBy(desc(interviewAnswers.attempt)).limit(1);
    const attempt=(lastAttempt?.attempt??0)+1;

    await db.insert(interviewAnswers).values({
      sessionId,questionId:question.id,attempt,answerText:payload.answer.trim(),
      score:evaluation.score,confidence:evaluation.confidence,verdict:evaluation.verdict,
      strengths:evaluation.strengths,gaps:evaluation.gaps,feedback:evaluation.feedback,
      coveredSignals:evaluation.coveredSignals,rubric:evaluation.rubric
    });

    let followUp:{id:number;mode:"ai"|"heuristic"}|null=null;
    const [followUpCountRow]=await db.select({count:sql<number>`count(*)`}).from(interviewQuestions).where(and(
      eq(interviewQuestions.sessionId,sessionId),eq(interviewQuestions.isFollowUp,true)
    ));
    if(evaluation.score<65&&!question.isFollowUp&&Number(followUpCountRow?.count??0)<2){
      const generated=await generateAdaptiveFollowUp({
        title:context.job.title,company:context.job.company,jd:context.job.description,
        profile:context.profile,gaps:evaluation.gaps,mode:session.mode as "mixed"|"technical"|"behavioral"|"system_design",
        parentQuestion:questionForEvaluation,score:evaluation.score
      });
      const nextSequence=question.sequence+1;
      await db.transaction(async tx=>{
        await tx.update(interviewQuestions).set({
          sequence:sql`sequence + 1`,updatedAt:new Date()
        }).where(and(eq(interviewQuestions.sessionId,sessionId),gt(interviewQuestions.sequence,question.sequence)));
        const [created]=await tx.insert(interviewQuestions).values({
          sessionId,sequence:nextSequence,type:generated.question.type,area:generated.question.area,
          question:generated.question.question,expectedSignals:generated.question.expectedSignals,
          evidenceContext:generated.question.evidenceContext,isFollowUp:true,parentQuestionId:question.id
        }).returning();
        followUp={id:created.id,mode:generated.mode};
        await tx.update(interviewSessions).set({
          questionCount:sql`question_count + 1`,updatedAt:new Date()
        }).where(eq(interviewSessions.id,sessionId));
      });
    }

    const allQuestions=await db.select().from(interviewQuestions)
      .where(eq(interviewQuestions.sessionId,sessionId)).orderBy(asc(interviewQuestions.sequence));
    const answeredRows=await db.select({questionId:interviewAnswers.questionId})
      .from(interviewAnswers).where(eq(interviewAnswers.sessionId,sessionId));
    const answeredIds=new Set(answeredRows.map(row=>row.questionId));
    const nextQuestion=followUp
      ? allQuestions.find(q=>q.id===followUp!.id)??null
      : allQuestions.find(q=>!answeredIds.has(q.id))??null;
    const answeredCount=answeredIds.size;
    await db.update(interviewSessions).set({answeredCount,updatedAt:new Date()})
      .where(eq(interviewSessions.id,sessionId));

    return Response.json({
      evaluation,attempt,answeredCount,questionCount:allQuestions.length,
      followUpCreated:Boolean(followUp),generator:evaluation.model?"ai":"heuristic",
      nextQuestion
    });
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid interview answer.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to evaluate interview answer."},{status:503});
  }
}
