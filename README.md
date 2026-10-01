# CareerOS — Evidence-Backed Job Search OS

CareerOS turns a target job into an evidence-backed application workflow:

```text
Job
 ↓
JD intelligence
 ↓
Requirements → candidate evidence
 ↓
Tailored resume / application package
 ↓
Verified outreach
 ↓
Learning + interview prep
 ↓
Application tracking
 ↓
Observed-outcome learning
```

## Core capabilities

- Profile-aware job discovery and JD analysis.
- Requirement → proof mapping with truth-locked resume generation.
- Application package versioning and ATS-oriented validation.
- Provider-bounded job ingestion for Lever and Ashby public boards.
- Recruiter-contact provenance and approval state.
- Gmail and Microsoft Graph mailbox synchronization with provider-native cursors.
- Explicit outbound-email approval boundaries.
- Persistent adaptive interview practice.
- Outcome-based ranking calibration and conservative learning from observed application stages.
- Scheduled mailbox refresh with leases/backoff and protected worker authentication.

## Security / trust rules

CareerOS must never fabricate candidate facts, recruiter identities, URLs, email addresses, outcomes, or unsupported skills.

The server validates external/provider data at API boundaries. Job ingestion accepts a provider + board instead of arbitrary URLs to reduce SSRF exposure. OAuth tokens and provider credentials stay server-side and are stored through the application's encrypted credential boundary.

Unknown information remains explicit.

## Architecture

```text
Next.js application
 ├── Authenticated API routes
 ├── PostgreSQL + Drizzle
 ├── JD / resume intelligence
 ├── Job ingestion adapters
 ├── Mailbox adapters
 ├── Recruiter intelligence
 ├── Interview engine
 └── Outcome learning / ranking calibration
```

## Environment

Create `.env.local` with the database and worker secrets required by the deployment.

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB
DB_POOL_MAX=10
CAREEROS_WORKER_SECRET=generate-a-long-random-secret
```

Optional provider credentials are documented in the integration sections of the repository.

## Quick start

```bash
npm install
npm run db:push
npm run dev
```

Health: `GET /api/health`

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

CI also runs CodeQL, Scorecard, dependency review, and the scheduled mailbox workflow.

## Outcome learning

The ranking learner uses observed application-stage events rather than treating non-applied jobs as negative outcomes. Calibration is conservative, capped, versioned, and exposed with supporting signals so ranking changes remain explainable.

The learner is empirical personalization infrastructure; it is not a prediction of an employer's decision or a guarantee of shortlisting.

## Mailbox automation

The scheduled worker reuses Gmail history IDs and Microsoft Graph delta links rather than rescanning a mailbox on every run. Each connection carries sync scheduling/failure state and a short lease to reduce duplicate work. Outbound actions remain explicitly approved.

## Resume intelligence

Uploaded resumes support PDF/DOCX/TXT extraction, fingerprints for duplicate detection, parser warnings for scan-only PDFs, candidate fact extraction, source history, and on-demand artifact generation.

## Evidence policy

Application quality, ranking, parsing, and learning claims should be tied to reproducible artifacts and explicitly labeled as observed measurements, design targets, or deterministic test evidence.

## Review path

Start with [SECURITY.md](SECURITY.md), then inspect authenticated API boundaries, provider connectors, database migrations, resume artifacts, mailbox synchronization, and learning/calibration code.

## Maintenance standard

Keep secrets server-side, external inputs schema-validated, scheduled mailbox work idempotent, and all generated candidate/recruiter facts traceable to source evidence.

## License

MIT
