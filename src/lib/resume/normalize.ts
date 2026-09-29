import { createHash } from "node:crypto";

const KNOWN_SKILLS = [
  "Python","JavaScript","TypeScript","React","Next.js","Node.js","FastAPI","Flask","PostgreSQL","SQL",
  "Redis","Docker","Kubernetes","AWS","Git","Testing","RAG","LLMs","LangGraph","Airflow","dbt",
  "Snowflake","Power BI","Java","C++","REST APIs","CI/CD","System Design","GraphQL"
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractResumeFacts(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const linkedinUrl = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-_%]+/i)?.[0] ?? null;
  const skills = KNOWN_SKILLS.filter((skill) => normalize(text).includes(normalize(skill)));

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const summaryCandidate = lines
    .filter((line) => line.length >= 60 && line.length <= 500)
    .slice(0, 3)
    .join(" ");

  return {
    email,
    linkedinUrl,
    skills,
    summaryCandidate,
    sourceHash: createHash("sha256").update(text).digest("hex"),
  };
}
