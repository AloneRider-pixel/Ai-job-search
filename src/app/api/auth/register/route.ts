import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(10).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL is required." }, { status: 503 });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing[0]) return Response.json({ error: "An account with this email already exists." }, { status: 409 });

    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        name: body.name,
        email: body.email,
        passwordHash: hashPassword(body.password),
      }).returning();

      const [profile] = await tx.insert(profiles).values({
        userId: user.id,
        email: user.email,
        name: user.name,
        targetRoles: [],
        targetLocations: [],
        skills: [],
        preferences: {},
      }).returning();

      return { user, profile };
    });

    await createSession(created.user.id);

    return Response.json({
      user: { id: created.user.id, email: created.user.email, name: created.user.name },
      profile: created.profile,
    }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) return Response.json({ error: "Invalid registration data.", details: (error as { issues: unknown }).issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 503 });
  }
}
