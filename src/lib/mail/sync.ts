import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationEvents, applications, emailMessages, mailboxConnections, outreachSequences } from "@/db/schema";
import { findBestApplication } from "@/lib/mail/application-matcher";
import { classifyEmail } from "@/lib/mail/classifier";
import { getConnection, getValidSecrets } from "@/lib/mail/connection";
import { syncGoogleMessages } from "@/lib/mail/providers/google";
import { MicrosoftMailCursor, syncMicrosoftMessages } from "@/lib/mail/providers/microsoft";
import { MailProvider } from "@/lib/mail/types";
import { recordApplicationStageEvent, retrainOutcomeModel } from "@/lib/learning/engine";

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
function parseCursor(value:string|null){
  if(!value)return {};
  try{
    const parsed=JSON.parse(value) as Record<string,unknown>;
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch{return {};}
}

type SyncMessage={
  providerMessageId:string;threadId?:string|null;direction:"inbound"|"outbound";subject:string;
  fromEmail:string|null;toEmails:string[];receivedAt?:Date|null;sentAt?:Date|null;snippet?:string|null;
  bodyText?:string|null;metadata:Record<string,unknown>;
};

async function upsertMessage(profileId:number,connectionId:number,message:SyncMessage){
  const [existing]=await db.select({id:emailMessages.id}).from(emailMessages).where(and(
    eq(emailMessages.connectionId,connectionId),eq(emailMessages.providerMessageId,message.providerMessageId)
  )).limit(1);
  if(existing){
    await db.update(emailMessages).set({
      threadId:message.threadId??null,direction:message.direction,subject:message.subject,fromEmail:message.fromEmail,
      toEmails:message.toEmails,receivedAt:message.receivedAt??null,sentAt:message.sentAt??null,
      snippet:message.snippet??null,bodyText:message.bodyText??null,metadata:message.metadata,updatedAt:new Date()
    }).where(eq(emailMessages.id,existing.id));
    return {id:existing.id,inserted:false};
  }
  const [created]=await db.insert(emailMessages).values({
    profileId,connectionId,providerMessageId:message.providerMessageId,threadId:message.threadId??null,
    direction:message.direction,subject:message.subject,fromEmail:message.fromEmail,toEmails:message.toEmails,
    receivedAt:message.receivedAt??null,sentAt:message.sentAt??null,snippet:message.snippet??null,
    bodyText:message.bodyText??null,metadata:message.metadata
  }).returning({id:emailMessages.id});
  return {id:created.id,inserted:true};
}

export async function syncMailbox(profileId:number,provider:MailProvider){
  const connection=await getConnection(profileId,provider);
  if(!connection)throw new Error("No connected "+provider+" mailbox.");
  const {accessToken}=await getValidSecrets(connection);
  const cursor=parseCursor(connection.syncCursor);

  const result=provider==="google"
    ?await syncGoogleMessages(accessToken,connection.accountEmail,typeof cursor.historyId==="string"?cursor.historyId:undefined)
    :await syncMicrosoftMessages(accessToken,connection.accountEmail,(cursor.microsoft??{}) as Partial<MicrosoftMailCursor>);

  let inserted=0,updated=0,events=0;
  for(const message of result.messages){
    const saved=await upsertMessage(profileId,connection.id,message);
    if(saved.inserted)inserted++;else updated++;
    if(message.direction!=="inbound")continue;

    const candidates=classifyEmail(message.subject,message.bodyText??message.snippet??"");
    if(!candidates.length)continue;
    const best=await findBestApplication(profileId,{subject:message.subject,body:message.bodyText??message.snippet??"",fromEmail:message.fromEmail});

    for(const candidate of candidates){
      const [existingEvent]=await db.select({id:applicationEvents.id}).from(applicationEvents).where(and(
        eq(applicationEvents.messageId,saved.id),eq(applicationEvents.eventType,candidate.type)
      )).limit(1);
      if(existingEvent)continue;

      await db.insert(applicationEvents).values({
        profileId,applicationId:best?.applicationId??null,messageId:saved.id,eventType:candidate.type,
        confidence:candidate.confidence,evidence:candidate.evidence,occurredAt:message.receivedAt??new Date()
      });
      events++;

      if(!best||candidate.confidence<75)continue;
      const targetStage=stageForEvent(candidate.type);
      if(targetStage){
        const [application]=await db.select().from(applications).where(and(
          eq(applications.id,best.applicationId),eq(applications.profileId,profileId)
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
          await recordApplicationStageEvent({
            profileId,
            applicationId:application.id,
            fromStage:application.stage,
            toStage:targetStage,
            source:"mailbox",
            metadata:{eventType:candidate.type,confidence:candidate.confidence,evidence:candidate.evidence}
          });
        }
      }

      if(["rejection","offer","recruiter_reply","interview","scheduling"].includes(candidate.type)){
        await db.update(outreachSequences).set({
          status:"stopped",
          stopReason:candidate.type==="rejection"?"rejection":candidate.type==="offer"?"offer":"reply_detected",
          updatedAt:new Date()
        }).where(and(
          eq(outreachSequences.profileId,profileId),eq(outreachSequences.applicationId,best.applicationId)
        ));
      }
    }
  }

  const nextCursor=provider==="google"
    ?JSON.stringify({version:2,provider:"google",historyId:(result as {historyId:string}).historyId})
    :JSON.stringify({version:2,provider:"microsoft",microsoft:(result as {cursor:MicrosoftMailCursor}).cursor});

  const now=new Date();
  await db.update(mailboxConnections).set({
    syncCursor:nextCursor,lastSyncAt:now,lastError:null,updatedAt:now
  }).where(eq(mailboxConnections.id,connection.id));
  if(events>0)await retrainOutcomeModel(profileId);

  return {provider,connectionId:connection.id,discovered:result.messages.length,inserted,updated,events,cursorUpdated:true};
}
