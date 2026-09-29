import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationPackages } from "@/db/schema";
import { z } from "zod";

const packageSchema = z.object({
  profileId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  fitScore: z.number().int().min(0).max(100).optional().nullable(),
  status: z.enum(["draft", "ready", "submitted"]).default("draft"),
  resumeText: z.string().max(50000).optional().nullable(),
  resumeFileUrl: z.string().url().optional().nullable(),
  coverLetter: z.string().max(30000).optional().nullable(),
  outreachDraft: z.string().max(30000).optional().nullable(),
  requirementMatrix: z.array(z.record(z.string(), z.unknown())).default([]),
  learningPlan: z.array(z.record(z.string(), z.unknown())).default([]),
  nextActions: z.array(z.string().max(1000)).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return Response.json({ error: "DATABASE_URL is required." }, { status: 503 });
    }

    const payload = packageSchema.parse(await req.json());

    const previous = await db
      .select({ version: applicationPackages.version })
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.profileId, payload.profileId),
          eq(applicationPackages.jobId, payload.jobId),
        ),
      );

    const nextVersion =
      (previous.reduce((max, row) => Math.max(max, row.version), 0) || 0) + 1;

    const [created] = await db
      .insert(applicationPackages)
      .values({ ...payload, version: nextVersion })
      .returning();

    return Response.json({ package: created }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json(
        {
          error: "Invalid application package.",
          details: (error as { issues: unknown }).issues,
        },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save application package.",
      },
      { status: 503 },
    );
  }
}
