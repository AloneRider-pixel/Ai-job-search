import { and, eq, isNull, lte, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { mailboxConnections } from "@/db/schema";
import { syncMailbox } from "@/lib/mail/sync";
import type { MailProvider } from "@/lib/mail/types";

const BASE_INTERVAL_MS=15*60*1000;
const BASE_RETRY_MS=5*60*1000;
const MAX_BACKOFF_MS=6*60*60*1000;
const LEASE_MS=10*60*1000;
const MAX_CONNECTIONS_PER_RUN=25;

function errorText(error:unknown){
  return (error instanceof Error?error.message:String(error)).slice(0,1200);
}

function retryDelayMs(failureCount:number){
  return Math.min(MAX_BACKOFF_MS,BASE_RETRY_MS*Math.pow(2,Math.min(Math.max(failureCount-1,0),7)));
}

export async function runMailboxScheduler(args:{limit?:number;now?:Date}={}){
  const limit=Math.max(1,Math.min(args.limit??10,MAX_CONNECTIONS_PER_RUN));
  const now=args.now??new Date();
  const processed:Array<Record<string,unknown>>=[];

  for(let i=0;i<limit;i++){
    const leaseUntil=new Date(now.getTime()+LEASE_MS);
    const claimed=await db.update(mailboxConnections).set({
      syncLeaseUntil:leaseUntil,
      updatedAt:now
    }).where(and(
      eq(mailboxConnections.status,"connected"),
      or(isNull(mailboxConnections.nextSyncAt),lte(mailboxConnections.nextSyncAt,now)),
      or(isNull(mailboxConnections.syncLeaseUntil),lt(mailboxConnections.syncLeaseUntil,now))
    )).returning({
      id:mailboxConnections.id,
      profileId:mailboxConnections.profileId,
      provider:mailboxConnections.provider,
      accountEmail:mailboxConnections.accountEmail,
      syncFailureCount:mailboxConnections.syncFailureCount
    });

    const connection=claimed[0];
    if(!connection)break;

    try{
      const provider=connection.provider as MailProvider;
      if(provider!=="google"&&provider!=="microsoft")throw new Error("Unsupported mailbox provider.");
      const result=await syncMailbox(connection.profileId,provider);
      const nextSyncAt=new Date(Date.now()+BASE_INTERVAL_MS);
      await db.update(mailboxConnections).set({
        nextSyncAt,
        syncFailureCount:0,
        syncLeaseUntil:null,
        lastError:null,
        updatedAt:new Date()
      }).where(eq(mailboxConnections.id,connection.id));
      processed.push({
        connectionId:connection.id,provider,accountEmail:connection.accountEmail,
        ok:true,nextSyncAt:nextSyncAt.toISOString(),result
      });
    }catch(error){
      const failureCount=(connection.syncFailureCount??0)+1;
      const nextSyncAt=new Date(Date.now()+retryDelayMs(failureCount));
      const lastError=errorText(error);
      await db.update(mailboxConnections).set({
        nextSyncAt,syncFailureCount:failureCount,syncLeaseUntil:null,lastError,updatedAt:new Date()
      }).where(eq(mailboxConnections.id,connection.id));
      processed.push({
        connectionId:connection.id,provider:connection.provider,
        accountEmail:connection.accountEmail,ok:false,
        failureCount,nextSyncAt:nextSyncAt.toISOString(),error:lastError
      });
    }
  }

  return {
    processed:processed.length,
    succeeded:processed.filter(item=>item.ok===true).length,
    failed:processed.filter(item=>item.ok===false).length,
    baseIntervalMinutes:BASE_INTERVAL_MS/60000,
    maxPerRun:limit,
    results:processed
  };
}

export async function scheduleMailboxImmediately(connectionId:number){
  await db.update(mailboxConnections).set({
    nextSyncAt:new Date(),
    syncFailureCount:0,
    syncLeaseUntil:null,
    lastError:null,
    updatedAt:new Date()
  }).where(eq(mailboxConnections.id,connectionId));
}
