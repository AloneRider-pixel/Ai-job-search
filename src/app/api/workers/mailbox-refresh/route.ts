import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { runMailboxScheduler } from "@/lib/mail/scheduler";

function authorized(req:NextRequest){
  const expected=process.env.CAREEROS_WORKER_SECRET;
  const supplied=req.headers.get("x-careeros-worker-secret")??"";
  if(!expected||!supplied)return false;
  const a=Buffer.from(expected);
  const b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}

const querySchema=z.object({limit:z.coerce.number().int().min(1).max(25).default(10)});

export async function POST(req:NextRequest){
  if(!authorized(req))return Response.json({error:"Unauthorized worker request."},{status:401});
  try{
    const payload=querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const result=await runMailboxScheduler({limit:payload.limit});
    return Response.json({ok:true,...result});
  }catch(error){
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid worker request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Mailbox worker failed."},{status:503});
  }
}
