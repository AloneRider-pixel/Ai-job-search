import { NextRequest } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { mailboxConnections, oauthStates, profiles } from "@/db/schema";
import { encryptSecret, sha256 } from "@/lib/mail/crypto";
import { exchangeGoogleCode } from "@/lib/mail/providers/google";
import { exchangeMicrosoftCode } from "@/lib/mail/providers/microsoft";

export async function GET(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  const provider=(await params).provider;
  const url=new URL(req.url);
  const code=url.searchParams.get("code");
  const state=url.searchParams.get("state");
  const error=url.searchParams.get("error");
  if(error)return Response.redirect(new URL("/?connection=error",req.url));
  if(!code||!state)return Response.redirect(new URL("/?connection=invalid",req.url));
  if(provider!=="google"&&provider!=="microsoft")return Response.redirect(new URL("/?connection=invalid_provider",req.url));

  try{
    const [oauth]=await db.select().from(oauthStates).where(and(
      eq(oauthStates.stateHash,sha256(state)),
      eq(oauthStates.provider,provider),
      gt(oauthStates.expiresAt,new Date())
    )).limit(1);
    if(!oauth)return Response.redirect(new URL("/?connection=expired",req.url));

    const [profile]=await db.select().from(profiles).where(eq(profiles.userId,oauth.userId)).limit(1);
    if(!profile)return Response.redirect(new URL("/?connection=profile_missing",req.url));

    const identity=provider==="google"?await exchangeGoogleCode(code):await exchangeMicrosoftCode(code);
    if(!identity.email)throw new Error("Connected mailbox did not return an account email.");

    const existing=await db.select({id:mailboxConnections.id}).from(mailboxConnections).where(and(
      eq(mailboxConnections.profileId,profile.id),
      eq(mailboxConnections.provider,provider),
      eq(mailboxConnections.providerAccountId,identity.accountId)
    )).limit(1);

    const values={
      profileId:profile.id,
      provider,
      providerAccountId:identity.accountId,
      accountEmail:identity.email,
      accessTokenEncrypted:encryptSecret(identity.accessToken),
      refreshTokenEncrypted:identity.refreshToken?encryptSecret(identity.refreshToken):null,
      tokenExpiresAt:identity.tokenExpiresAt??null,
      scopes:identity.scopes,
      status:"connected",
      lastError:null,
      updatedAt:new Date()
    };

    if(existing[0])await db.update(mailboxConnections).set(values).where(eq(mailboxConnections.id,existing[0].id));
    else await db.insert(mailboxConnections).values(values);

    await db.delete(oauthStates).where(eq(oauthStates.id,oauth.id));
    return Response.redirect(new URL("/?connection=connected",req.url));
  }catch(error){
    console.error("OAuth callback failed",error);
    return Response.redirect(new URL("/?connection=failed",req.url));
  }
}
