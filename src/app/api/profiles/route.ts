import { NextRequest } from "next/server";
import { profileCreateSchema } from "@/lib/validation";
import { createProfile } from "@/lib/repositories";

export async function POST(req: NextRequest) {
  try {
    const payload = profileCreateSchema.parse(await req.json());
    const profile = await createProfile(payload);
    return Response.json({ profile }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return Response.json({ error: "Invalid profile payload.", details: (error as { issues: unknown }).issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create profile." }, { status: 503 });
  }
}
