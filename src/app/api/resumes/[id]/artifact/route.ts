import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { profiles, resumeDocuments } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { generateDocx, generatePdf, resumeModelFromText } from "@/lib/resume/artifacts";

export const runtime="nodejs";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const current=await requireAuth();
    const id=Number((await params).id);
    if(!Number.isInteger(id)||id<=0)return Response.json({error:"Invalid resume id."},{status:400});

    const [row]=await db.select({document:resumeDocuments,profile:profiles})
      .from(resumeDocuments)
      .innerJoin(profiles,eq(resumeDocuments.profileId,profiles.id))
      .where(and(eq(resumeDocuments.id,id),eq(profiles.userId,current.user.id)))
      .limit(1);

    if(!row)return Response.json({error:"Resume not found."},{status:404});

    const format=new URL(req.url).searchParams.get("format")==="pdf"?"pdf":"docx";
    const resume=resumeModelFromText(row.document.rawText);
    if(!resume.contact)resume.contact=[row.profile.email,row.profile.location].filter(Boolean).join(" · ");
    if(!resume.name.trim()||resume.name==="Candidate")resume.name=row.profile.name;

    const stem="careeros-resume-"+row.document.id;
    if(format==="pdf"){
      const bytes=await generatePdf(resume);
      return new Response(bytes,{
        headers:{
          "content-type":"application/pdf",
          "content-disposition":"attachment; filename="+stem+".pdf",
          "cache-control":"private, no-store"
        }
      });
    }

    const bytes=await generateDocx(resume);
    return new Response(bytes,{
      headers:{
        "content-type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition":"attachment; filename="+stem+".docx",
        "cache-control":"private, no-store"
      }
    });
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to generate resume artifact."},{status:503});
  }
}
