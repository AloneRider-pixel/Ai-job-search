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

## Remaining production layers

- Delta-based mailbox synchronization and scheduled refresh workers
- Adaptive interview simulator
- Outcome-learning ranking model
- Outcome-based job-ranking calibration
- Dashboard migration from demo-local state to fully persistent APIs

### 6. Resume intelligence + artifacts
- PDF, DOCX and TXT upload endpoint
- 10 MB upload ceiling
- PDF text extraction with `pdf-parse`
- DOCX raw-text extraction with Mammoth
- SHA-256 document fingerprinting and idempotent duplicate handling
- Observable parser warnings for scanned/image-only PDFs
- Candidate fact extraction without inventing experience
- Private Resume Vault UI
- Resume source history
- On-demand ATS-friendly DOCX export
- On-demand PDF export
- Raw-text export fallback for arbitrary uploaded layouts

The PDF parser follows the current `pdf-parse` API and releases, while DOCX extraction uses Mammoth's documented `extractRawText` API. citeturn975333search0turn194865search0


## Communication intelligence layer

The mailbox layer supports Gmail and Microsoft Graph authorization, encrypted token storage, mailbox synchronization, normalized email storage, application-event detection, application-stage updates, follow-up stopping, and explicit outbound email approval.

Google's server-side OAuth guidance uses an authorization code flow with offline access for background mailbox access; Microsoft documents the OAuth authorization-code flow with delegated Graph permissions. Gmail message listing exposes message/thread identifiers, and Graph supports delta-query change tracking for later incremental synchronization. See the official provider documentation. 


## Recruiter intelligence layer

CareerOS can discover recruiter and hiring-side contact candidates for a specific job through a provider-backed workflow:

1. Resolve the employer domain from job metadata/URL or Hunter Domain Finder.
2. Search Apollo for current recruiting or hiring-side people at that employer.
3. Enrich the highest-signal candidates for LinkedIn URL, email, email status, and provider match metadata.
4. Store source evidence, provider person IDs, job association, confidence, and verification state.
5. Keep every discovered contact in `candidate` approval state until the user reviews it.
6. Allow outreach only after the contact is explicitly approved and the email is provider-verified.

Environment:

```bash
APOLLO_API_KEY=
HUNTER_API_KEY=
```

Apollo's current People API Search supports employer-domain and title filters and does not return email addresses; People Enrichment can return a LinkedIn URL, email, and email status. Hunter's Domain Finder resolves a company name to likely employer domains. These provider integrations are optional until their credentials are configured. See the current provider documentation. 
