import { destroySession } from "@/lib/auth/session";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Logout failed." }, { status: 503 });
  }
}
