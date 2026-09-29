import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationEvents, applications, emailMessages, jobs } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const events=await db.select({
      id:applicationEvents.id,eventType:applicationEvents.eventType,confidence:applicationEvents.confidence,evidence:applicationEvents.evidence,
      occurredAt:applicationEvents.occurredAt,message:emailMessages,application:applications,job:jobs
    }).from(applicationEvents)
      .innerJoin(emailMessages,eq(applicationEvents.messageId,emailMessages.id))
      .leftJoin(applications,eq(applicationEvents.applicationId,applications.id))
      .leftJoin(jobs,eq(applications.jobId,jobs.id))
      .where(eq(applicationEvents.profileId,profile.id))
      .orderBy(desc(applicationEvents.occurredAt)).limit(100);
    return Response.json({events});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load application events."},{status:503});
  }
}
