import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs } from "@/db/schema";

function tokens(value:string){return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(x=>x.length>3));}

function overlap(a:string,b:string){
  const aa=tokens(a);const bb=tokens(b);let n=0;
  aa.forEach(token=>{if(bb.has(token))n++;});
  return aa.size?n/aa.size:0;
}

export async function findBestApplication(profileId:number,args:{subject:string;body:string;fromEmail:string|null}){
  const rows=await db.select({application:applications,job:jobs}).from(applications).innerJoin(jobs,eq(applications.jobId,jobs.id))
    .where(eq(applications.profileId,profileId)).orderBy(desc(applications.updatedAt)).limit(100);
  let best:{applicationId:number;score:number}|null=null;
  for(const row of rows){
    const companyScore=overlap(row.job.company,(args.fromEmail??"").split("@")[0]);
    const textScore=overlap(row.job.company+" "+row.job.title,args.subject+" "+args.body.slice(0,3000));
    const score=Math.round(companyScore*45+textScore*55);
    if(!best||score>best.score)best={applicationId:row.application.id,score};
  }
  return best&&best.score>=18?best:null;
}
