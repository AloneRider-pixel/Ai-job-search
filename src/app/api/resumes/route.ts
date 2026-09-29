import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { profiles, resumeDocuments } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";
import { extractResumeFacts } from "@/lib/resume/normalize";
import { parseResumeFile, RESUME_MAX_BYTES } from "@/lib/resume/parser";

export const runtime="nodejs";

export async function POST(req:NextRequest){
  try{
    const {profile,user}=await requireProfile();
    const contentType=req.headers.get("content-type")??"";

    let rawText="";
    let filename:string|null=null;
    let sourceType:"pdf"|"docx"|"text"="text";
    let mimeType="text/plain";
    let fileHash="";
    let warnings:string[]=[];

    if(contentType.includes("multipart/form-data")){
      const form=await req.formData();
      const file=form.get("file");
      if(!(file instanceof File))return Response.json({error:"A resume file is required."},{status:400});
      if(file.size>RESUME_MAX_BYTES)return Response.json({error:"Resume file exceeds the 10 MB limit."},{status:413});

      const parsed=await parseResumeFile(file);
      rawText=parsed.rawText;filename=file.name;sourceType=parsed.sourceType;mimeType=parsed.mimeType;fileHash=parsed.sha256;warnings=parsed.warnings;
    }else{
      const body=await req.json() as {text?:string;filename?:string;isMaster?:boolean};
      rawText=String(body.text??"").trim();
      filename=body.filename??null;
      if(rawText.length<100)return Response.json({error:"Resume text must contain at least 100 characters."},{status:400});
      const {createHash}=await import("node:crypto");
      fileHash=createHash("sha256").update(rawText).digest("hex");
    }

    if(rawText.length<100){
      return Response.json({error:"The resume could not be parsed into enough text. Try a text-based PDF/DOCX or paste the resume text.",warnings},{status:422});
    }

    const facts=extractResumeFacts(rawText);
    const [document]=await db.insert(resumeDocuments).values({
      profileId:profile.id,filename,sourceType,mimeType,fileHash,rawText,
      parsedData:{...facts,mimeType,warnings,parser:"resume-ingestion-v2"},
      isMaster:true,
    }).returning();

    await db.update(profiles).set({
      email:facts.email??profile.email??user.email,
      summary:profile.summary??facts.summaryCandidate,
      skills:Array.from(new Set([...(profile.skills??[]),...facts.skills])),
      preferences:{...profile.preferences,linkedinUrl:facts.linkedinUrl??profile.preferences?.linkedinUrl??null,masterResumeDocumentId:document.id},
      updatedAt:new Date()
    }).where(eq(profiles.id,profile.id));

    return Response.json({document,facts,warnings},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to ingest resume."},{status:503});
  }
}

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const documents=await db.select({
      id:resumeDocuments.id,filename:resumeDocuments.filename,sourceType:resumeDocuments.sourceType,mimeType:resumeDocuments.mimeType,
      isMaster:resumeDocuments.isMaster,createdAt:resumeDocuments.createdAt
    }).from(resumeDocuments).where(eq(resumeDocuments.profileId,profile.id)).orderBy(resumeDocuments.createdAt);
    return Response.json({documents});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load resumes."},{status:503});
  }
}
