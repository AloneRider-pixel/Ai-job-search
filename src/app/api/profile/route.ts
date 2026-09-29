import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { profileExperiences, profiles } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";
import { profileUpdateSchema } from "@/lib/validation";

const experienceSchema=z.object({
  title:z.string().trim().min(1).max(180),
  company:z.string().trim().min(1).max(180),
  startDate:z.coerce.date().optional().nullable(),
  endDate:z.coerce.date().optional().nullable(),
  bullets:z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  technologies:z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  evidence:z.array(z.record(z.string(),z.unknown())).max(20).default([])
});

export async function GET(){
  try{
    const current=await requireAuth();
    const data=await getProfileWithExperiences(current.user.id);
    if(!data)return Response.json({error:"Profile not found."},{status:404});
    return Response.json(data);
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load profile."},{status:503});
  }
}

export async function PATCH(req:NextRequest){
  try{
    const current=await requireAuth();
    const payload=profileUpdateSchema.parse(await req.json());
    const [profile]=await db.update(profiles).set({...payload,updatedAt:new Date()}).where(eq(profiles.userId,current.user.id)).returning();
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    return Response.json({profile});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid profile update.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to update profile."},{status:503});
  }
}

export async function POST(req:NextRequest){
  try{
    const current=await requireAuth();
    const profile=await getProfileWithExperiences(current.user.id);
    if(!profile)return Response.json({error:"Profile not found."},{status:404});
    const payload=experienceSchema.parse(await req.json());
    const [experience]=await db.insert(profileExperiences).values({profileId:profile.profile.id,...payload}).returning();
    return Response.json({experience},{status:201});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid experience payload.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to add experience."},{status:503});
  }
}
