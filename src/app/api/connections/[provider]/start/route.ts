import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthStates } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { sha256 } from "@/lib/mail/crypto";
import { googleAuthorizeUrl } from "@/lib/mail/providers/google";
import { microsoftAuthorizeUrl } from "@/lib/mail/providers/microsoft";

export async function GET(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  try{
    const current=await requireAuth();
    const provider=(await params).provider;
    if(provider!=="google"&&provider!=="microsoft")return Response.json({error:"Unsupported mailbox provider."},{status:400});
    const state=randomBytes(32).toString("base64url");
    await db.delete(oauthStates).where(eq(oauthStates.userId,current.user.id));
    await db.insert(oauthStates).values({
      userId:current.user.id,provider,stateHash:sha256(state),expiresAt:new Date(Date.now()+10*60*1000)
    });
    const url=provider==="google"?googleAuthorizeUrl(state):microsoftAuthorizeUrl(state);
    return Response.redirect(url);
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to start OAuth."},{status:503});
  }
}
