import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { ok: false, service: "ai-job-search", database: "not_configured" },
      { status: 503 },
    );
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "ai-job-search",
      database: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "ai-job-search",
        database: "unavailable",
        error: error instanceof Error ? error.message : "database check failed",
      },
      { status: 503 },
    );
  }
}
