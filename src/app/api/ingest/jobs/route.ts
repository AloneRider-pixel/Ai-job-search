import { NextRequest } from "next/server";
import { upsertJob } from "@/lib/repositories";
import { fetchAshbyJobs, fetchLeverJobs } from "@/lib/job-sources";
import { z } from "zod";

const requestSchema = z.object({
  provider: z.enum(["lever", "ashby"]),
  board: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  try {
    const { provider, board } = requestSchema.parse(await req.json());
    const fetched = provider === "lever" ? await fetchLeverJobs(board) : await fetchAshbyJobs(board);
    const persisted = [];

    for (const job of fetched) {
      persisted.push(await upsertJob(job));
    }

    return Response.json({
      provider,
      board,
      discovered: fetched.length,
      persisted: persisted.length,
      jobs: persisted,
    });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json({ error: "Invalid ingestion request.", details: (error as { issues: unknown }).issues }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to ingest jobs." },
      { status: 502 },
    );
  }
}
