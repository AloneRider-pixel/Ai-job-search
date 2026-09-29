import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL is required." }, { status: 503 });

    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user.id);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) return Response.json({ error: "Invalid login data.", details: (error as { issues: unknown }).issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Login failed." }, { status: 503 });
  }
}
