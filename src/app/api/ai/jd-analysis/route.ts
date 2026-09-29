import {NextRequest} from "next/server";
import {z} from "zod";
import {buildAIApplicationPackage} from "@/lib/ai/application-package";

const requestSchema=z.object({
  title:z.string().min(1).max(240),company:z.string().min(1).max(240),jd:z.string().min(40).max(60000),
  profile:z.object({
    name:z.string().min(1).max(160),headline:z.string().max(240).optional(),experienceYears:z.number().min(0).max(60),
    skills:z.array(z.string().min(1).max(120)).max(200),summary:z.string().max(5000).optional(),
    experience:z.array(z.object({title:z.string().max(180),company:z.string().max(180),bullets:z.array(z.string().max(1000)).max(20)})).max(30)
  })
});

export async function POST(req:NextRequest){
  try{
    const payload=requestSchema.parse(await req.json());
    const result=await buildAIApplicationPackage(payload);
    return Response.json({ai:result.data,model:result.model,generatedAt:new Date().toISOString()});
  }catch(error){
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid JD analysis payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"AI analysis failed."},{status:503});
  }
}
