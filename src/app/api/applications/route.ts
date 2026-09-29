import { NextRequest } from "next/server";
import { createOrUpdateApplication, listApplications } from "@/lib/repositories";
import { applicationCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const profileId = Number(new URL(req.url).searchParams.get("profileId"));
    if (!Number.isInteger(profileId) || profileId <= 0) return Response.json({ error: "profileId must be a positive integer." }, { status: 400 });
    return Response.json({ applications: await listApplications(profileId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load applications." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = applicationCreateSchema.parse(await req.json());
    const application = await createOrUpdateApplication(payload);
    return Response.json({ application }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json({ error: "Invalid application payload.", details: (error as { issues: unknown }).issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save application." }, { status: 503 });
  }
}
