import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationEvents, applications, emailMessages, mailboxConnections, outreachSequences } from "@/db/schema";
import { findBestApplication } from "@/lib/mail/application-matcher";
import { classifyEmail } from "@/lib/mail/classifier";
import { getConnection, getValidSecrets } from "@/lib/mail/connection";
import { listGoogleMessages } from "@/lib/mail/providers/google";
import { listMicrosoftMessages } from "@/lib/mail/providers/microsoft";
import { MailProvider } from "@/lib/mail/types";

const stageRank:Record<string,number>={wishlist:0,applied:1,screening:2,interview:3,offer:4,rejected:5};
function stageForEvent(type:string){
  if(type==="offer")return "offer";
  if(type==="rejection")return "rejected";
  if(type==="interview"||type==="scheduling")return "interview";
  if(type==="assessment"||type==="screening"||type==="request_info"||type==="recruiter_reply")return "screening";
  return null;
}
function shouldAdvance(current:string,target:string){
  if(current===target)return false;
  if((current==="offer"||current==="rejected")&&target!==current)return false;
  return (stageRank[target]??-1)>=(stageRank[current]??-1);
}

export async function syncMailbox(profileId:number,provider:MailProvider){
  const connection=await getConnection(profileId,provider);
  if(!connection)throw new Error("No connected "+provider+" mailbox.");
  const {accessToken}=await getValidSecrets(connection);
  const after=connection.lastSyncAt??undefined;
  const messages=provider==="google"
    ?await listGoogleMessages(accessToken,connection.accountEmail,after)
    :await listMicrosoftMessages(accessToken,connection.accountEmail,after);

  let inserted=0,events=0;

  for(const message of messages){
    const [existing]=await db.select({id:emailMessages.id}).from(emailMessages).where(and(
      eq(emailMessages.connectionId,connection.id),
      eq(emailMessages.providerMessageId,message.providerMessageId)
    )).limit(1);

    let messageId=existing?.id;
    if(!messageId){
      const [created]=await db.insert(emailMessages).values({
        profileId,
        connectionId:connection.id,
        providerMessageId:message.providerMessageId,
        threadId:message.threadId??null,
        direction:message.direction,
        subject:message.subject,
        fromEmail:message.fromEmail,
        toEmails:message.toEmails,
        receivedAt:message.receivedAt??null,
        sentAt:message.sentAt??null,
        snippet:message.snippet??null,
        bodyText:message.bodyText??null,
        metadata:message.metadata
      }).returning({id:emailMessages.id});
      messageId=created.id;
      inserted++;
    }

    if(message.direction!=="inbound"||!messageId)continue;
    const candidates=classifyEmail(message.subject,message.bodyText??message.snippet??"");
    if(!candidates.length)continue;

    const best=await findBestApplication(profileId,{
      subject:message.subject,
      body:message.bodyText??message.snippet??"",
      fromEmail:message.fromEmail
    });

    for(const candidate of candidates){
      const [existingEvent]=await db.select({id:applicationEvents.id}).from(applicationEvents).where(and(
        eq(applicationEvents.messageId,messageId),
        eq(applicationEvents.eventType,candidate.type)
      )).limit(1);
      if(existingEvent)continue;

      await db.insert(applicationEvents).values({
        profileId,
        applicationId:best?.applicationId??null,
        messageId,
        eventType:candidate.type,
        confidence:candidate.confidence,
        evidence:candidate.evidence,
        occurredAt:message.receivedAt??new Date()
      });
      events++;

      if(best&&candidate.confidence>=75){
        const targetStage=stageForEvent(candidate.type);
        if(targetStage){
          const [application]=await db.select().from(applications).where(and(
            eq(applications.id,best.applicationId),
            eq(applications.profileId,profileId)
          )).limit(1);

          if(application&&shouldAdvance(application.stage,targetStage)){
            await db.update(applications).set({
              stage:targetStage,
              outcome:targetStage==="rejected"?"rejected":application.outcome,
              nextAction:targetStage==="interview"
                ?"Prepare for the next interview stage."
                :targetStage==="screening"
                ?"Review the recruiter response and prepare for screening."
                :targetStage==="offer"
                ?"Review the offer details."
                :targetStage==="rejected"
                ?null
                :application.nextAction,
              updatedAt:new Date()
            }).where(eq(applications.id,application.id));
          }
        }

        if(["rejection","offer","recruiter_reply","interview","scheduling"].includes(candidate.type)){
          await db.update(outreachSequences).set({
            status:"stopped",
            stopReason:candidate.type==="rejection"?"rejection":candidate.type==="offer"?"offer":"reply_detected",
            updatedAt:new Date()
          }).where(and(
            eq(outreachSequences.profileId,profileId),
            eq(outreachSequences.applicationId,best.applicationId)
          ));
        }
      }
    }
  }

  const now=new Date();
  await db.update(mailboxConnections).set({lastSyncAt:now,lastError:null,updatedAt:now}).where(eq(mailboxConnections.id,connection.id));
  return {provider,connectionId:connection.id,discovered:messages.length,inserted,events};
}
