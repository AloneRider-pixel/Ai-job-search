# CareerOS — Evidence-Backed Job Search OS

CareerOS turns a target role into a traceable application workflow:

```text
Job
 ↓
JD intelligence
 ↓
Requirement → candidate evidence
 ↓
Tailored application package
 ↓
Approved outreach
 ↓
Interview preparation
 ↓
Application tracking
 ↓
Observed-outcome learning
```

## Core capabilities

- Profile-aware job discovery and job-description analysis.
- Requirement-to-proof mapping and truth-locked resume generation.
- Versioned application packages and ATS-oriented validation.
- Provider-bounded ingestion for public Lever and Ashby boards.
- Recruiter-contact provenance and verification state.
- Gmail and Microsoft Graph synchronization with provider-native cursors.
- Explicit approval boundary for outbound email.
- Persistent adaptive interview practice.
- Outcome-based ranking calibration from observed application stages.
- Scheduled mailbox refresh with leases/backoff and protected worker authentication.

## Security model

CareerOS must not fabricate candidate facts, recruiter identities, URLs, addresses, outcomes, or unsupported skills.

External/provider data is schema-validated at API boundaries. Job ingestion accepts a provider + board rather than an arbitrary URL, reducing SSRF exposure. OAuth tokens and provider credentials remain server-side and pass through the application's encrypted credential boundary.

Unknown information stays explicit rather than being guessed.

## Architecture

```text
Next.js
 ├── authenticated API routes
 ├── PostgreSQL + Drizzle
 ├── JD / resume intelligence
 ├── job ingestion adapters
 ├── mailbox adapters
 ├── recruiter intelligence
 ├── interview engine
 └── outcome learning / calibration
```

## Environment

Create `.env.local` with deployment-specific values.

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB
DB_POOL_MAX=10
CAREEROS_WORKER_SECRET=<generate-a-long-random-secret>
```

Never commit real credentials.

## Quick start

```bash
npm install
npm run db:push
npm run dev
```

Health endpoint: `GET /api/health`.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

CI additionally runs CodeQL, Scorecard, dependency review, and the scheduled mailbox workflow.

## Ranking and outcome learning

The learner updates ranking behavior from observed application-stage events. It does not treat non-applied jobs as negative outcomes. Calibration is bounded, versioned, and surfaced with supporting signals so ranking changes remain explainable.

This is empirical personalization infrastructure, not a prediction of an employer's decision or a guarantee of shortlisting.

## Resume intelligence

Uploaded resumes support PDF/DOCX/TXT extraction, duplicate fingerprints, parser warnings for scan-only PDFs, candidate fact extraction, source history, and on-demand artifact generation.

## Mailbox automation

Scheduled synchronization uses Gmail history IDs and Microsoft Graph delta links to avoid full mailbox rescans. Connection state tracks scheduling/failures and short leases reduce duplicate work. Outbound actions require explicit approval.

## Evidence policy

Claims about parsing, ranking, learning, or application quality should identify whether they are observed measurements, design targets, or deterministic test evidence, with reproducible artifacts where applicable.

## Documentation

- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Maintenance standard

Keep secrets server-side, validate external inputs, keep scheduled work idempotent, and make generated candidate/recruiter facts traceable to source evidence.

## License

MIT
