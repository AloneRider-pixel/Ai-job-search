# CareerOS — Evidence-Backed Job Search OS

**Core product primitive:** every target job becomes an evidence-backed application package.

Product loop:

Job → JD Intelligence → Requirement → Candidate Evidence → Tailored Resume → Verified Outreach → Learning → Interview Prep → Application Tracking → Outcome Learning

## Implemented in this vertical slice

- Profile-aware Job Radar
- Evidence-Backed Application Studio
- Requirement → proof matrix
- Truth-locked tailored resume generation
- ATS-style resume signal
- Personalized outreach draft
- Recruiter search/verification guardrail
- Skill-gap learning actions
- Local application tracker
- Outcome-loop foundation

## Important boundary

Live integrations still need connection to the production providers you choose:

- authorized job feeds / company ATS sources
- an LLM provider
- user-authorized mailbox (Gmail/Outlook)
- compliant professional/contact-data provider
- production database + authentication
- interview/calendar integrations

The product deliberately does not claim to guarantee shortlisting. Its objective is to maximize evidence-backed application quality and reduce wasted applications.

## Run

npm install
npm run dev
