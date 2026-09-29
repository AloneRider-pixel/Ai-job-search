import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationStageEvents, applications, jobs } from "@/db/schema";
import { getProfileWithExperiences } from "@/lib/repositories";
import { requireAuth } from "@/lib/auth/guards";

const ranks:Record<string,number>={wishlist:0,applied:1,screening:2,interview:3,offer:4,rejected:5};

export async function GET(){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({summary:null,transitions:[]});
    const rows=await db.select({
      event:applicationStageEvents,
      application:applications,
      job:jobs
    }).from(applicationStageEvents)
      .innerJoin(applications,eq(applicationStageEvents.applicationId,applications.id))
      .innerJoin(jobs,eq(applications.jobId,jobs.id))
      .where(eq(applicationStageEvents.profileId,profile.profile.id))
      .orderBy(asc(applicationStageEvents.occurredAt));

    const applicationsCount=new Set(rows.map(r=>r.application.id)).size;
    const progressed=new Set(rows.filter(r=>(ranks[r.application.stage]??0)>=2).map(r=>r.application.id)).size;
    const interviewed=new Set(rows.filter(r=>(ranks[r.application.stage]??0)>=3).map(r=>r.application.id)).size;
    const offers=new Set(rows.filter(r=>r.application.stage==="offer").map(r=>r.application.id)).size;
    const rejected=new Set(rows.filter(r=>r.application.stage==="rejected").map(r=>r.application.id)).size;

    const transitions=rows.slice(-100).map(r=>({
      id:r.event.id,applicationId:r.application.id,jobTitle:r.job.title,company:r.job.company,
      fromStage:r.event.fromStage,toStage:r.event.toStage,source:r.event.source,occurredAt:r.event.occurredAt
    }));

    return Response.json({
      summary:{applications:applicationsCount,screening:progressed,interview:interviewed,offers,rejected},
      transitions
    });
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load learning stats."},{status:503});
  }
}
