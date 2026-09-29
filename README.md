# CareerOS — Evidence-Backed Job Search OS

CareerOS turns each target job into an evidence-backed application package:

Job → JD Intelligence → Requirement → Candidate Evidence → Tailored Resume → Verified Outreach → Learning → Interview Prep → Application Tracking → Outcome Learning

## Current engineering layers

### 1. Evidence-backed application core
- Profile-aware Job Radar
- Application Studio
- Requirement → proof matrix
- Truth-locked resume generation
- ATS-style scoring
- Outreach drafting with no fabricated identities
- Skill-gap actions
- Application tracker

### 2. Persistent backend
- PostgreSQL + Drizzle schema
- Profile and experience storage
- Normalized job storage
- Job analysis storage
- Versioned application packages
- Application pipeline
- Recruiter-contact provenance and verification state
- Outreach message state
- Learning tasks
- Health check against PostgreSQL
- Zod validation at API boundaries

### 3. Real job ingestion
The ingestion boundary accepts a provider + board name rather than an arbitrary URL. That keeps server-side fetching restricted to known provider hosts and avoids SSRF through user-controlled URLs.

Implemented providers:
- Lever public postings
- Ashby public job postings

Example:
`POST /api/ingest/jobs`

```json
{
  "provider": "ashby",
  "board": "ExampleCompany"
}
```

The ingestion service normalizes provider-specific records into the shared `jobs` table and upserts on `source + externalId`.

## Environment

Create `.env.local`:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB
DB_POOL_MAX=10
```

Then:

```bash
npm install
npm run db:push
npm run dev
```

Health:
`GET /api/health`

Jobs:
`GET /api/jobs`

Applications:
`GET /api/applications?profileId=1`

Application package persistence:
`POST /api/application-packages`

## Trust rules

CareerOS must never fabricate:
- candidate experience or metrics
- skills not supported by evidence
- recruiter identities
- professional profile URLs
- email addresses
- interview outcomes

Unknown information remains explicit.

The product is designed to improve application quality and job-search efficiency; it does not guarantee shortlisting.

## Next production integrations

- Authentication and tenant isolation
- LLM provider abstraction
- Resume DOCX/PDF artifact generation
- Gmail/Outlook mailbox synchronization
- Compliant contact enrichment + verification
- Scheduled job refresh workers
- Application-event ingestion
- Adaptive interview simulator
- Outcome-learning ranking model
