export type NormalizedJob = {
  source: "lever" | "ashby";
  externalId: string;
  title: string;
  company: string;
  location?: string | null;
  employmentType?: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  description: string;
  postedAt?: Date | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
};

function assertBoardName(value: string) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(value)) {
    throw new Error("Invalid job-board name.");
  }
  return value;
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "CareerOS/2.1 job-ingestion" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Provider request failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

export async function fetchLeverJobs(site: string): Promise<NormalizedJob[]> {
  const board = assertBoardName(site);
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json&limit=100`;
  const payload = await getJson(url);
  if (!Array.isArray(payload)) throw new Error("Unexpected Lever response.");

  return payload.map((raw) => {
    const job = asRecord(raw);
    const categories = asRecord(job.categories);
    const locations = Array.isArray(categories.allLocations) ? categories.allLocations.join(", ") : categories.location;
    return {
      source: "lever",
      externalId: String(job.id),
      title: String(job.text ?? ""),
      company: board,
      location: locations ? String(locations) : null,
      employmentType: job.commitment ? String(job.commitment) : null,
      applyUrl: job.applyUrl ? String(job.applyUrl) : null,
      sourceUrl: job.hostedUrl ? String(job.hostedUrl) : null,
      description: String(job.descriptionPlain ?? job.openingPlain ?? ""),
      postedAt: null,
      isActive: true,
      metadata: {
        workplaceType: job.workplaceType ?? null,
        team: categories.team ?? null,
        department: categories.department ?? null,
        country: job.country ?? null,
        salaryRange: job.salaryRange ?? null,
      },
    };
  }).filter((job) => job.title && job.description.length >= 40);
}

export async function fetchAshbyJobs(boardName: string): Promise<NormalizedJob[]> {
  const board = assertBoardName(boardName);
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
  const payload = asRecord(await getJson(url));
  if (!Array.isArray(payload.jobs)) throw new Error("Unexpected Ashby response.");

  return payload.jobs.map((raw: unknown) => {
    const job = asRecord(raw);
    const address = asRecord(asRecord(job.address).postalAddress);
    const secondary = Array.isArray(job.secondaryLocations)
      ? job.secondaryLocations.map((item: unknown) => String(asRecord(item).location ?? "")).filter(Boolean)
      : [];
    const locationParts = [job.location, ...secondary].filter(Boolean).map(String);

    return {
      source: "ashby",
      externalId: String(job.jobUrl ?? job.applyUrl ?? `${board}:${job.title}:${job.publishedAt}`),
      title: String(job.title ?? ""),
      company: board,
      location: locationParts.length ? [...new Set(locationParts)].join(" · ") : [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", ") || null,
      employmentType: job.employmentType ? String(job.employmentType) : null,
      applyUrl: job.applyUrl ? String(job.applyUrl) : null,
      sourceUrl: job.jobUrl ? String(job.jobUrl) : null,
      description: String(job.descriptionPlain ?? ""),
      postedAt: job.publishedAt ? new Date(String(job.publishedAt)) : null,
      isActive: job.isListed !== false,
      metadata: {
        department: job.department ?? null,
        team: job.team ?? null,
        isRemote: job.isRemote ?? false,
        workplaceType: job.workplaceType ?? null,
        compensation: job.compensation ?? null,
      },
    };
  }).filter((job) => job.isActive && job.title && job.description.length >= 40);
}
