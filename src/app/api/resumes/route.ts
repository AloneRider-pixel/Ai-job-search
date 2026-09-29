import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profileExperiences, profiles, resumeDocuments } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

const schema = z.object({
  filename: z.string().trim().max(255).optional(),
  text: z.string().trim().min(100).max(50000),
  isMaster: z.boolean().default(true),
});

const KNOWN_SKILLS = ["Python","JavaScript","TypeScript","React","Next.js","Node.js","FastAPI","Flask","PostgreSQL","SQL","Redis","Docker","Kubernetes","AWS","Git","Testing","RAG","LLMs","LangGraph","Airflow","dbt","Snowflake","Power BI","Java","C++","REST APIs","CI/CD","System Design"];

function extractEmail(text:string){return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??null;}
function extractLinkedIn(text:string){return text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-_%]+/i)?.[0]??null;}
function extractSkills(text:string){return KNOWN_SKILLS.filter(s=>text.toLowerCase().includes(s.toLowerCase()));}
function extractSummary(text:string){return text.split(/\n+/).map(x=>x.trim()).filter(x=>x.length>=60&&x.length<=500).slice(0,3).join(" ");}

export async function POST(req:NextRequest){
  try{
    const {profile,user}=await requireProfile();
    const payload=schema.parse(await req.json());

    const parsedData={
      email:extractEmail(payload.text),
      linkedinUrl:extractLinkedIn(payload.text),
      skills:extractSkills(payload.text),
      summaryCandidate:extractSummary(payload.text),
      parser:"deterministic-v1",
    };

    const [document]=await db.insert(resumeDocuments).values({
      profileId:profile.id,
      filename:payload.filename??null,
      sourceType:"text",
      rawText:payload.text,
      parsedData,
      isMaster:payload.isMaster,
    }).returning();

    if(payload.isMaster){
      const skills=parsedData.skills.length?parsedData.skills:profile.skills;
      await db.update(profiles).set({
        email:parsedData.email??profile.email??user.email,
        summary:profile.summary??parsedData.summaryCandidate,
        skills,
        preferences:{
          ...profile.preferences,
          linkedinUrl:parsedData.linkedinUrl,
          resumeDocumentId:document.id,
        },
        updatedAt:new Date(),
      }).where(eq(profiles.id,profile.id));
    }

    return Response.json({document,parsedData,profileId:profile.id},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid resume payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to ingest resume."},{status:503});
  }
}

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const documents=await db.select({
      id:resumeDocuments.id,filename:resumeDocuments.filename,sourceType:resumeDocuments.sourceType,isMaster:resumeDocuments.isMaster,createdAt:resumeDocuments.createdAt,updatedAt:resumeDocuments.updatedAt
    }).from(resumeDocuments).where(eq(resumeDocuments.profileId,profile.id)).orderBy(resumeDocuments.createdAt);
    return Response.json({documents});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load resumes."},{status:503});
  }
}
