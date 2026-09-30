import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  applicationPackages,
  applicationStageEvents,
  applications,
  jobs,
  rankingCalibrations,
} from "@/db/schema";

const STAGES: Record<string, number> = {
  wishlist: 0,
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
};

const TERMINAL_OUTCOME_PATTERN =
  /offer|offered|hired|hire|accepted|acceptance|rejected|reject|declined|withdrawn|withdraw|closed|cancelled|canceled/;

export type CalibrationStat = {
  n: number;
  closed: number;
  screened: number;
  interviewed: number;
  offered: number;
  rejected: number;
  withdrawn: number;
  screenRate: number;
  interviewRate: number;
  offerRate: number;
  outcomeIndex: number;
  reliability: number;
  lift: number;
};

type TrainingRecord = {
  roleFamily: string;
  seniority: string;
  fitBand: string;
  source: string;
  workMode: string;
  interaction: string;
  screened: boolean;
  interviewed: boolean;
  offered: boolean;
  rejected: boolean;
  withdrawn: boolean;
  terminal: boolean;
};

export type RankingCalibrationModel = {
  baseline: CalibrationStat;
  features: Record<string, Record<string, CalibrationStat>>;
  interactions: Record<string, CalibrationStat>;
  methodology: {
    version: string;
    minimumSamples: number;
    featureMinimumSamples: number;
    smoothing: string;
    outcomeWeights: {
      screening: number;
      interview: number;
      offer: number;
    };
    calibrationWeight: number;
    interactionWeight: number;
    maxAdjustment: number;
    leakageRule: string;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function betaRate(success: number, n: number) {
  return n ? Number(((success + 2) / (n + 4)).toFixed(4)) : 0.5;
}

function outcomeIndex(
  screenRate: number,
  interviewRate: number,
  offerRate: number,
) {
  return Number(
    (
      screenRate * 0.35 +
      interviewRate * 0.35 +
      offerRate * 0.3
    ).toFixed(4),
  );
}

function isOfferOutcome(value: string) {
  return /offer|offered|hired|hire|accepted|acceptance/.test(value);
}

function isNegativeOutcome(value: string) {
  return /rejected|reject|declined|withdrawn|withdraw|cancelled|canceled/.test(
    value,
  );
}

function isTerminalOutcome(value: string) {
  return TERMINAL_OUTCOME_PATTERN.test(value);
}

function seniority(title: string) {
  const t = normalize(title);
  if (/intern|internship|trainee|apprentice/.test(t)) return "entry";
  if (/staff|principal|distinguished|architect/.test(t)) return "staff";
  if (/lead|manager|head/.test(t)) return "lead";
  if (/senior|sr\b/.test(t)) return "senior";
  if (/junior|jr\b|associate|graduate/.test(t)) return "junior";
  return "mid";
}

function roleFamily(title: string) {
  const t = normalize(title);
  if (/machine learning|ml\b|ai\b|artificial intelligence|llm|data scientist/.test(t))
    return "ai";
  if (/data engineer|analytics engineer|data platform|etl/.test(t))
    return "data";
  if (/frontend|front end|react|ui engineer/.test(t)) return "frontend";
  if (/full.?stack/.test(t)) return "fullstack";
  if (/backend|back end|api engineer/.test(t)) return "backend";
  if (
    /devops|sre|site reliability|platform engineer|cloud engineer|infrastructure/.test(
      t,
    )
  )
    return "platform";
  if (/qa|quality assurance|test engineer|sdet/.test(t)) return "quality";
  if (/software engineer|software developer|application engineer|developer/.test(t))
    return "software";
  if (/product manager|program manager|business analyst|analyst/.test(t))
    return "product";
  return "other";
}

function fitBand(score: number | null | undefined) {
  if (score === null || score === undefined) return "unknown";
  if (score >= 90) return "90-100";
  if (score >= 75) return "75-89";
  if (score >= 60) return "60-74";
  return "0-59";
}

function workMode(location: string | null | undefined) {
  const l = normalize(location);
  if (/remote/.test(l)) return "remote";
  if (/hybrid/.test(l)) return "hybrid";
  if (/on.?site|onsite/.test(l)) return "onsite";
  return "unknown";
}

function hasReached(history: string[], target: string) {
  const targetRank = STAGES[target] ?? 0;
  return history.some((stage) => (STAGES[stage] ?? 0) >= targetRank && stage !== "rejected");
}

function deriveOutcome(
  currentStage: string,
  explicitOutcome: string | null | undefined,
  history: string[],
) {
  const stageValues = [...history, currentStage]
    .map(normalize)
    .filter(Boolean);
  const outcomeValue = normalize(explicitOutcome);

  const offered =
    stageValues.some((stage) => stage === "offer" || stage === "hired") ||
    isOfferOutcome(outcomeValue);
  const interviewed = offered || hasReached(stageValues, "interview");
  const screened = interviewed || hasReached(stageValues, "screening");
  const rejected =
    stageValues.includes("rejected") || isNegativeOutcome(outcomeValue);
  const withdrawn =
    /withdrawn|withdraw|cancelled|canceled/.test(outcomeValue) ||
    stageValues.includes("withdrawn");
  const terminal =
    offered ||
    rejected ||
    withdrawn ||
    isTerminalOutcome(outcomeValue);

  return {
    screened,
    interviewed,
    offered,
    rejected,
    withdrawn,
    terminal,
  };
}

function smoothStat(records: TrainingRecord[], baselineIndex: number): CalibrationStat {
  const n = records.length;
  const closedRecords = records.filter((record) => record.terminal);
  const closed = closedRecords.length;
  const screened = records.filter((record) => record.screened).length;
  const interviewed = records.filter((record) => record.interviewed).length;
  const offered = records.filter((record) => record.offered).length;
  const rejected = records.filter((record) => record.rejected).length;
  const withdrawn = records.filter((record) => record.withdrawn).length;

  const screenRate = betaRate(screened, n);
  const interviewRate = betaRate(interviewed, n);
  // Offer conversion is measured only on terminal applications. Active
  // interviews are censored observations and must not be treated as failures.
  const offerRate = betaRate(offered, closed);
  const index = outcomeIndex(screenRate, interviewRate, offerRate);
  const reliability = clamp(n / (n + 8), 0, 1);

  return {
    n,
    closed,
    screened,
    interviewed,
    offered,
    rejected,
    withdrawn,
    screenRate,
    interviewRate,
    offerRate,
    outcomeIndex: index,
    reliability: Number(reliability.toFixed(4)),
    lift: Number((index - baselineIndex).toFixed(4)),
  };
}

async function loadRows(profileId: number) {
  return db
    .select({
      application: applications,
      job: jobs,
      package: applicationPackages,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(
      applicationPackages,
      eq(applications.packageId, applicationPackages.id),
    )
    .where(
      and(
        eq(applications.profileId, profileId),
        ne(applications.stage, "wishlist"),
      ),
    )
    .orderBy(desc(applications.updatedAt));
}

function packageFitScore(
  packageRow: Awaited<ReturnType<typeof loadRows>>[number]["package"],
  appliedAt: Date | null,
) {
  if (!packageRow || packageRow.fitScore === null || packageRow.fitScore === undefined) {
    return null;
  }

  // A package updated/created after application time can contain information
  // that did not exist at ranking time. Exclude it from calibration features.
  if (
    appliedAt &&
    packageRow.createdAt &&
    new Date(packageRow.createdAt).getTime() > new Date(appliedAt).getTime()
  ) {
    return null;
  }

  return packageRow.fitScore;
}

function recordFor(
  row: Awaited<ReturnType<typeof loadRows>>[number],
  stageHistory: Map<number, string[]>,
): TrainingRecord | null {
  const history = stageHistory.get(row.application.id) ?? [];
  const outcome = deriveOutcome(
    row.application.stage,
    row.application.outcome,
    history,
  );

  // Wishlist/applied-without-outcome observations are censored: they do not
  // tell us whether the ranking decision would have led to a good outcome.
  if (!outcome.screened && !outcome.interviewed && !outcome.offered && !outcome.terminal) {
    return null;
  }

  const appliedAt = row.application.appliedAt ?? row.application.createdAt;
  const fitScore = packageFitScore(row.package, appliedAt);

  const family = roleFamily(row.job.title);
  const fit = fitBand(fitScore);

  return {
    roleFamily: family,
    seniority: seniority(row.job.title),
    fitBand: fit,
    source: row.job.source || "unknown",
    workMode: workMode(row.job.location),
    interaction: family + "|" + fit,
    ...outcome,
  };
}

export async function trainRankingCalibration(profileId: number) {
  const rows = await loadRows(profileId);
  const historyRows = await db
    .select({
      applicationId: applicationStageEvents.applicationId,
      toStage: applicationStageEvents.toStage,
      occurredAt: applicationStageEvents.occurredAt,
    })
    .from(applicationStageEvents)
    .where(eq(applicationStageEvents.profileId, profileId))
    .orderBy(applicationStageEvents.occurredAt);

  const stageHistory = new Map<number, string[]>();
  for (const event of historyRows) {
    if (event.applicationId === null) continue;
    const list = stageHistory.get(event.applicationId) ?? [];
    list.push(event.toStage);
    stageHistory.set(event.applicationId, list);
  }

  const records = rows
    .map((row) => recordFor(row, stageHistory))
    .filter((record): record is TrainingRecord => record !== null);

  const baseline = smoothStat(records, 0.5);
  const baselineIndex = baseline.outcomeIndex;

  type CalibrationFeature =
  | "roleFamily"
  | "seniority"
  | "fitBand"
  | "source"
  | "workMode";

  const featureGroups: Record<CalibrationFeature, Record<string, CalibrationStat>> = {
    roleFamily: {},
    seniority: {},
    fitBand: {},
    source: {},
    workMode: {},
  };

  for (const feature of Object.keys(featureGroups) as CalibrationFeature[]) {
    const groups = new Map<string, TrainingRecord[]>();

    for (const record of records) {
      const key = record[feature];
      const list = groups.get(key) ?? [];
      list.push(record);
      groups.set(key, list);
    }

    for (const [key, group] of groups) {
      featureGroups[feature][key] = smoothStat(group, baselineIndex);
    }
  }

  const interactions: Record<string, CalibrationStat> = {};
  const groups = new Map<string, TrainingRecord[]>();

  for (const record of records) {
    const list = groups.get(record.interaction) ?? [];
    list.push(record);
    groups.set(record.interaction, list);
  }

  for (const [key, group] of groups) {
    interactions[key] = smoothStat(group, baselineIndex);
  }

  const model: RankingCalibrationModel = {
    baseline,
    features: featureGroups,
    interactions,
    methodology: {
      version: "calibration-v2-outcome-censored",
      minimumSamples: 5,
      featureMinimumSamples: 3,
      smoothing: "Beta(2,2) per milestone; offer rate uses terminal applications only",
      outcomeWeights: {
        screening: 0.35,
        interview: 0.35,
        offer: 0.3,
      },
      calibrationWeight: 0.28,
      interactionWeight: 0.25,
      maxAdjustment: 15,
      leakageRule:
        "Do not use package fitScore when its package was created after application time; applied-only observations are censored",
    },
  };

  const [existing] = await db
    .select()
    .from(rankingCalibrations)
    .where(eq(rankingCalibrations.profileId, profileId))
    .limit(1);

  const values = {
    profileId,
    version: (existing?.version ?? 0) + 1,
    sampleCount: records.length,
    baseline: model.baseline,
    featureStats: model.features,
    interactions: model.interactions,
    methodology: model.methodology,
    trainedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    const [saved] = await db
      .update(rankingCalibrations)
      .set(values)
      .where(eq(rankingCalibrations.id, existing.id))
      .returning();
    return saved;
  }

  const [saved] = await db
    .insert(rankingCalibrations)
    .values(values)
    .returning();
  return saved;
}

export async function getRankingCalibration(profileId: number) {
  const [model] = await db
    .select()
    .from(rankingCalibrations)
    .where(eq(rankingCalibrations.profileId, profileId))
    .limit(1);

  return model ?? null;
}

export function getCalibrationAdjustment(
  model: Awaited<ReturnType<typeof getRankingCalibration>>,
  job: { title: string; source: string; location: string | null },
  baseScore: number,
) {
  if (!model || model.sampleCount < 5) {
    return {
      adjustment: 0,
      calibratedScore: baseScore,
      confidence: 0,
      signals: [],
      modelVersion: null,
      calibrationIndex: null,
      expectedOfferRate: null,
      expectedOutcomeIndex: null,
    };
  }

  const stored = model as typeof model & {
    baseline: RankingCalibrationModel["baseline"];
    featureStats: RankingCalibrationModel["features"];
    interactions: RankingCalibrationModel["interactions"];
    methodology: RankingCalibrationModel["methodology"];
  };

  const baseline = stored.baseline?.outcomeIndex ?? 0.5;
  const minimum = stored.methodology?.featureMinimumSamples ?? 3;
  const methodology = stored.methodology ?? {
    calibrationWeight: 0.28,
    interactionWeight: 0.25,
    maxAdjustment: 15,
  };

  const keys = [
    ["roleFamily", roleFamily(job.title)],
    ["seniority", seniority(job.title)],
    ["fitBand", fitBand(baseScore)],
    ["source", job.source || "unknown"],
    ["workMode", workMode(job.location)],
  ] as const;

  const evidence: Array<{ name: string; stat: CalibrationStat }> = [];

  for (const [kind, key] of keys) {
    const stat = stored.featureStats?.[kind]?.[key];
    if (stat && stat.n >= minimum) {
      evidence.push({ name: kind + ":" + key, stat });
    }
  }

  const interactionKey = roleFamily(job.title) + "|" + fitBand(baseScore);
  const interaction = stored.interactions?.[interactionKey];
  const usableInteraction =
    interaction && interaction.n >= minimum ? interaction : null;

  const totalWeight = evidence.reduce(
    (sum, item) => sum + item.stat.reliability,
    0,
  );

  const featureIndex = totalWeight
    ? evidence.reduce(
        (sum, item) => sum + item.stat.outcomeIndex * item.stat.reliability,
        0,
      ) / totalWeight
    : baseline;

  const interactionWeight = usableInteraction
    ? Math.min(
        methodology.interactionWeight ?? 0.25,
        usableInteraction.reliability,
      )
    : 0;

  const combinedIndex =
    featureIndex * (1 - interactionWeight) +
    (usableInteraction?.outcomeIndex ?? featureIndex) * interactionWeight;

  const rawDelta = combinedIndex - baseline;
  const dataSupport = clamp(model.sampleCount / 30, 0, 1);
  const evidenceSupport = clamp(evidence.length / 5, 0, 1);
  const confidence = clamp(
    Math.round(
      dataSupport * 55 +
        evidenceSupport * 30 +
        (usableInteraction ? 15 : 0),
    ),
    0,
    100,
  );

  const confidenceFactor = clamp(confidence / 100, 0.1, 1);
  const adjustment = clamp(
    Math.round(
      rawDelta *
        100 *
        (methodology.calibrationWeight ?? 0.28) *
        confidenceFactor,
    ),
    -(methodology.maxAdjustment ?? 15),
    methodology.maxAdjustment ?? 15,
  );

  const calibratedScore = clamp(baseScore + adjustment, 0, 100);

  return {
    adjustment: calibratedScore - baseScore,
    calibratedScore,
    confidence,
    signals: [
      ...evidence.map(
        (item) =>
          item.name +
          " · " +
          item.stat.n +
          " apps · outcome index " +
          Math.round(item.stat.outcomeIndex * 100) +
          "%",
      ),
      ...(usableInteraction
        ? [
            interactionKey +
              " · " +
              usableInteraction.n +
              " apps · offer rate " +
              Math.round(usableInteraction.offerRate * 100) +
              "%",
          ]
        : []),
    ],
    modelVersion: model.version,
    calibrationIndex: Math.round(combinedIndex * 100),
    expectedOfferRate: Math.round(
      ((usableInteraction?.offerRate ?? featureIndex) * 100),
    ),
    expectedOutcomeIndex: Math.round(combinedIndex * 100),
  };
}
