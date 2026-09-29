import { getCurrentUser } from "@/lib/auth/session";

export async function requireAuth() {
  const current = await getCurrentUser();
  if (!current) throw new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "content-type": "application/json" } });
  return current;
}

export async function requireProfile() {
  const current = await requireAuth();
  if (!current.profile) throw new Response(JSON.stringify({ error: "Candidate profile is not initialized." }), { status: 409, headers: { "content-type": "application/json" } });
  return { user: current.user, profile: current.profile };
}
