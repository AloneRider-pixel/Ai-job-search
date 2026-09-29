import { getProfileWithExperiences } from "@/lib/repositories";
import { getRankingCalibration, trainRankingCalibration } from "@/lib/learning/calibration";
import { requireAuth } from "@/lib/auth/guards";

function summarize(model: Awaited<ReturnType<typeof getRankingCalibration>>) {
  if (!model) return null;
  const baseline = model.baseline as Record<string, unknown>;
  const methodology = model.methodology as Record<string, unknown>;
  return {
    version: model.version,
    sampleCount: model.sampleCount,
    trainedAt: model.trainedAt,
    baselineOutcomeIndex:
      typeof baseline.outcomeIndex === "number" ? Math.round(baseline.outcomeIndex * 100) : null,
    featureGroups: Object.keys((model.featureStats ?? {}) as Record<string, unknown>),
    interactionCount: Object.keys((model.interactions ?? {}) as Record<string, unknown>).length,
    methodology,
  };
}

export async function GET() {
  try {
    const current = await requireAuth();
    const profile = await getProfileWithExperiences(current.user.id);
    if (!profile) return Response.json({ calibration: null });

    const calibration = await getRankingCalibration(profile.profile.id);
    return Response.json({
      calibration,
      summary: summarize(calibration),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load ranking calibration." },
      { status: 503 },
    );
  }
}

export async function POST() {
  try {
    const current = await requireAuth();
    const profile = await getProfileWithExperiences(current.user.id);
    if (!profile) return Response.json({ error: "Profile not found." }, { status: 404 });

    const calibration = await trainRankingCalibration(profile.profile.id);
    return Response.json({
      calibration,
      summary: summarize(calibration),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to train ranking calibration." },
      { status: 503 },
    );
  }
}
