import { NextRequest } from "next/server";
import { jobUpsertSchema } from "@/lib/validation";
import { listJobs, upsertJob } from "@/lib/repositories";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
    return Response.json({ jobs: await listJobs(Number.isFinite(limit) ? limit : 50) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load jobs." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = jobUpsertSchema.parse(await req.json());
    const job = await upsertJob(payload);
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json({ error: "Invalid job payload.", details: (error as { issues: unknown }).issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save job." }, { status: 503 });
  }
}
