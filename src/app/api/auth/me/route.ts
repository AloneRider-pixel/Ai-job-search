import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return Response.json({ user: null, profile: null });

  return Response.json({
    user: { id: current.user.id, email: current.user.email, name: current.user.name },
    profile: current.profile,
  });
}
