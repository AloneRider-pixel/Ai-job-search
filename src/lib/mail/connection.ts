import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxConnections } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/mail/crypto";
import { refreshGoogleToken } from "@/lib/mail/providers/google";
import { refreshMicrosoftToken } from "@/lib/mail/providers/microsoft";
import { MailProvider } from "@/lib/mail/types";

export async function getConnection(profileId:number,provider:MailProvider){
  const [connection]=await db.select().from(mailboxConnections).where(and(eq(mailboxConnections.profileId,profileId),eq(mailboxConnections.provider,provider),eq(mailboxConnections.status,"connected"))).limit(1);
  return connection??null;
}
export async function getAnyConnection(profileId:number){
  const [connection]=await db.select().from(mailboxConnections).where(and(eq(mailboxConnections.profileId,profileId),eq(mailboxConnections.status,"connected"))).orderBy(desc(mailboxConnections.updatedAt)).limit(1);
  return connection??null;
}
export async function getValidSecrets(connection:typeof mailboxConnections.$inferSelect){
  let accessToken=decryptSecret(connection.accessTokenEncrypted);
  let refreshToken=connection.refreshTokenEncrypted?decryptSecret(connection.refreshTokenEncrypted):null;
  if(connection.tokenExpiresAt&&connection.tokenExpiresAt.getTime()<Date.now()+120_000&&refreshToken){
    const refreshed=connection.provider==="google"?await refreshGoogleToken(refreshToken):await refreshMicrosoftToken(refreshToken);
    accessToken=refreshed.accessToken;refreshToken=refreshed.refreshToken??refreshToken;
    await db.update(mailboxConnections).set({accessTokenEncrypted:encryptSecret(accessToken),refreshTokenEncrypted:refreshToken?encryptSecret(refreshToken):connection.refreshTokenEncrypted,tokenExpiresAt:refreshed.tokenExpiresAt,lastError:null,updatedAt:new Date()}).where(eq(mailboxConnections.id,connection.id));
  }
  return {accessToken,refreshToken};
}
