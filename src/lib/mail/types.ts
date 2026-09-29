export type MailProvider = "google" | "microsoft";

export type NormalizedEmail = {
  providerMessageId: string;
  threadId?: string | null;
  direction: "inbound" | "outbound";
  subject: string;
  fromEmail: string | null;
  toEmails: string[];
  receivedAt?: Date | null;
  sentAt?: Date | null;
  snippet?: string | null;
  bodyText?: string | null;
  metadata: Record<string, unknown>;
};

export type MailConnectionSecrets = {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
};
