export type Job = { id: string; title: string; company: string; location?: string; url?: string };
export async function listJobs(): Promise<Job[]> { return []; }