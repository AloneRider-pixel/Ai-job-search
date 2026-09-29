import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";
import { profileCreateSchema, profileUpdateSchema } from "@/lib/validation";

export async function GET(){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({profile:null,experiences:[]});
    return Response.json({profile:profile.profile,experiences:profile.experiences});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load profile."},{status:503});
  }
}

export async function POST(req: NextRequest) {
  try {
    const current=await requireAuth();
    const existing=await getProfileWithExperiences(current.user.id);
    if(existing)return Response.json({error:"Profile already exists. Use PATCH to update it."},{status:409});
    const payload = profileCreateSchema.parse(await req.json());
    const profile = await db.insert(profiles).values({...payload,userId:current.user.id}).returning();
    return Response.json({ profile:profile[0] }, { status: 201 });
  } catch (error) {
    if(error instanceof Response)return error;
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json({ error: "Invalid profile payload.", details: (error as { issues: unknown }).issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create profile." }, { status: 503 });
  }
}

export async function PATCH(req:NextRequest){
  try{
    const current=await requireAuth();
    const existing=await getProfileWithExperiences(current.user.id);
    if(!existing)return Response.json({error:"Profile not found."},{status:404});
    const payload=profileUpdateSchema.parse(await req.json());
    const [profile]=await db.update(profiles).set({...payload,updatedAt:new Date()}).where(eq(profiles.id,existing.profile.id)).returning();
    return Response.json({profile});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid profile update.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to update profile."},{status:503});
  }
}
