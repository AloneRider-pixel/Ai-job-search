import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { applicationPackages, applications, jobs, profiles } from "@/db/schema";

function dbConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for this API.");
  }
}

export async function listJobs(limit = 50) {
  dbConfigured();
  return db.select().from(jobs).where(eq(jobs.isActive, true)).orderBy(desc(jobs.postedAt)).limit(Math.min(limit, 100));
}

export async function upsertJob(input: typeof jobs.$inferInsert) {
  dbConfigured();
  const existing = await db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.source, input.source!), eq(jobs.externalId, input.externalId!)))
    .limit(1);
  if (existing[0]) {
    const [updated] = await db.update(jobs).set({...input, updatedAt: new Date()}).where(eq(jobs.id, existing[0].id)).returning();
    return updated;
  }
  const [created] = await db.insert(jobs).values(input).returning();
  return created;
}

export async function listApplications(profileId: number) {
  dbConfigured();
  return db.select({
    application: applications,
    job: jobs,
    package: applicationPackages,
  })
  .from(applications)
  .innerJoin(jobs, eq(applications.jobId, jobs.id))
  .leftJoin(applicationPackages, eq(applications.packageId, applicationPackages.id))
  .where(eq(applications.profileId, profileId))
  .orderBy(desc(applications.updatedAt));
}

export async function createOrUpdateApplication(input: typeof applications.$inferInsert) {
  dbConfigured();
  const existing = await db.select({ id: applications.id }).from(applications)
    .where(and(eq(applications.profileId, input.profileId!), eq(applications.jobId, input.jobId!)))
    .limit(1);
  if (existing[0]) {
    const [updated] = await db.update(applications).set({...input, updatedAt: new Date()}).where(eq(applications.id, existing[0].id)).returning();
    return updated;
  }
  const [created] = await db.insert(applications).values(input).returning();
  return created;
}

export async function createProfile(input: typeof profiles.$inferInsert) {
  dbConfigured();
  const [created] = await db.insert(profiles).values(input).returning();
  return created;
}
