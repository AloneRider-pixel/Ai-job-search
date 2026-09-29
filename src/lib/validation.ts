import { z } from "zod";

export const profileCreateSchema = z.object({
  email: z.string().email().optional().nullable(),
  name: z.string().min(1).max(160),
  headline: z.string().max(240).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  targetRoles: z.array(z.string().min(1).max(120)).default([]),
  targetLocations: z.array(z.string().min(1).max(160)).default([]),
  skills: z.array(z.string().min(1).max(120)).default([]),
  preferences: z.record(z.string(), z.unknown()).default({}),
});

export const jobUpsertSchema = z.object({
  source: z.string().min(1).max(80),
  externalId: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  company: z.string().min(1).max(240),
  location: z.string().max(240).optional().nullable(),
  employmentType: z.string().max(80).optional().nullable(),
  applyUrl: z.string().url().optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  description: z.string().min(40),
  postedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const applicationCreateSchema = z.object({
  profileId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  packageId: z.number().int().positive().optional().nullable(),
  stage: z.enum(["wishlist", "applied", "screening", "interview", "offer", "rejected"]).default("wishlist"),
  nextAction: z.string().max(1000).optional().nullable(),
  nextActionAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

export const applicationUpdateSchema = applicationCreateSchema.partial().omit({ profileId: true, jobId: true });

export const profileUpdateSchema = profileCreateSchema.partial();
