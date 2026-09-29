import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxConnections } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const connections=await db.select({
      id:mailboxConnections.id,provider:mailboxConnections.provider,accountEmail:mailboxConnections.accountEmail,
      scopes:mailboxConnections.scopes,lastSyncAt:mailboxConnections.lastSyncAt,status:mailboxConnections.status,lastError:mailboxConnections.lastError
    }).from(mailboxConnections).where(eq(mailboxConnections.profileId,profile.id));
    return Response.json({connections});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load connections."},{status:503});
  }
}
