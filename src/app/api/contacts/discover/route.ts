import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobs, recruiterContacts } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";
import { discoverContacts, resolveCompanyDomain } from "@/lib/contacts/intelligence";

const schema=z.object({
  jobId:z.number().int().positive(),
  maxResults:z.number().int().min(1).max(10).default(6)
});

export async function POST(req:NextRequest){
  try{
    const {profile}=await requireProfile();
    if(!process.env.APOLLO_API_KEY)return Response.json({error:"APOLLO_API_KEY is required for recruiter discovery."},{status:503});

    const payload=schema.parse(await req.json());
    const [job]=await db.select().from(jobs).where(eq(jobs.id,payload.jobId)).limit(1);
    if(!job)return Response.json({error:"Job not found."},{status:404});

    const domainResult=await resolveCompanyDomain(job.company,job.metadata??{},job.applyUrl??null,job.sourceUrl??null);
    if(!domainResult.domain){
      return Response.json({
        error:"Company domain could not be resolved.",
        next:"Add HUNTER_API_KEY or store metadata.companyDomain for this job."
      },{status:422});
    }

    const candidates=await discoverContacts({
      company:job.company,
      jobTitle:job.title,
      domain:domainResult.domain,
      maxResults:payload.maxResults
    });

    let created=0,updated=0;
    const saved=[];
    for(const candidate of candidates){
      const where=candidate.email
        ? and(eq(recruiterContacts.profileId,profile.id),eq(recruiterContacts.email,candidate.email))
        : candidate.profileUrl
        ? and(eq(recruiterContacts.profileId,profile.id),eq(recruiterContacts.profileUrl,candidate.profileUrl))
        : null;

      const existing=where
        ? await db.select().from(recruiterContacts).where(where).orderBy(desc(recruiterContacts.updatedAt)).limit(1)
        : [];

      const evidence=[
        ...candidate.evidence,
        {discovery:{jobId:job.id,jobTitle:job.title,company:job.company},domainSource:domainResult.source}
      ];

      if(existing[0]){
        const [contact]=await db.update(recruiterContacts).set({
          jobId:job.id,
          company:candidate.company||job.company,
          name:candidate.name,
          role:candidate.role,
          profileUrl:candidate.profileUrl,
          email:candidate.email,
          source:"apollo",
          providerPersonId:candidate.providerPersonId,
          verificationState:candidate.emailStatus==="verified"?"verified":candidate.emailStatus==="invalid"?"invalid":"unverified",
          confidence:candidate.confidence,
          lastVerifiedAt:candidate.emailStatus==="verified"?new Date():existing[0].lastVerifiedAt,
          evidence,
          updatedAt:new Date()
        }).where(eq(recruiterContacts.id,existing[0].id)).returning();
        saved.push(contact);updated++;
      }else{
        const [contact]=await db.insert(recruiterContacts).values({
          profileId:profile.id,
          jobId:job.id,
          company:candidate.company||job.company,
          name:candidate.name,
          role:candidate.role,
          profileUrl:candidate.profileUrl,
          email:candidate.email,
          source:"apollo",
          providerPersonId:candidate.providerPersonId,
          approvalState:"candidate",
          verificationState:candidate.emailStatus==="verified"?"verified":candidate.emailStatus==="invalid"?"invalid":"unverified",
          confidence:candidate.confidence,
          lastVerifiedAt:candidate.emailStatus==="verified"?new Date():null,
          evidence
        }).returning();
        saved.push(contact);created++;
      }
    }

    return Response.json({
      job:{id:job.id,title:job.title,company:job.company},
      domain:domainResult.domain,
      domainSource:domainResult.source,
      discovered:candidates.length,
      created,
      updated,
      contacts:saved
    });
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid discovery request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Recruiter discovery failed."},{status:502});
  }
}
