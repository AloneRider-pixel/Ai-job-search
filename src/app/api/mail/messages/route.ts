import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { requireProfile } from "@/lib/auth/guards";

export async function GET(){
  try{
    const {profile}=await requireProfile();
    const messages=await db.select({
      id:emailMessages.id,providerMessageId:emailMessages.providerMessageId,threadId:emailMessages.threadId,direction:emailMessages.direction,
      subject:emailMessages.subject,fromEmail:emailMessages.fromEmail,toEmails:emailMessages.toEmails,receivedAt:emailMessages.receivedAt,
      sentAt:emailMessages.sentAt,snippet:emailMessages.snippet,bodyText:emailMessages.bodyText,createdAt:emailMessages.createdAt
    }).from(emailMessages).where(eq(emailMessages.profileId,profile.id)).orderBy(desc(emailMessages.createdAt)).limit(100);
    return Response.json({messages});
  }catch(error){
    if(error instanceof Response)return error;
    return Response.json({error:error instanceof Error?error.message:"Unable to load mailbox messages."},{status:503});
  }
}
