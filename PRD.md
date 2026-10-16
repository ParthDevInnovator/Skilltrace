# Product Requirements Document (PRD)
## Mosaic — Beyond the Resume

**Version:** 1.0  
**Status:** Proposed  
**Product Category:** AI-powered candidate intelligence and evidence-based recruitment  
**Primary Users:** Recruiters, talent acquisition teams, hiring managers

---

## 1. Executive Summary

Mosaic is an AI-powered candidate intelligence platform that consolidates fragmented candidate information into a unified, evidence-backed profile.

Recruiters often evaluate candidates using resumes, ATS records, previous applications, interview feedback, professional profiles, GitHub repositories, coding profiles, and project portfolios. These sources are disconnected, making it difficult to understand a candidate's actual experience and alignment with a particular job.

Mosaic addresses this problem by creating a candidate context layer that connects these sources, evaluates available evidence against job requirements, and presents the findings through an interactive recruiter workspace.

The platform enables recruiters to:

- Compare candidates against a job description.
- Examine evidence supporting individual resume claims.
- Understand previous application history and interview feedback.
- Identify skill gaps and unresolved claims.
- Generate evidence-backed candidate briefs.
- Prepare targeted interview questions.
- Explore candidate information through a conversational AI agent and knowledge graph.

**Product principle:** Mosaic informs hiring decisions through transparent evidence. It does not automatically decide whether a candidate should be hired.

## 2. Problem Statement

### 2.1 Current problems

Recruiters face several challenges during candidate screening:

1. **Fragmented information:** Candidate information is distributed across resumes, ATS records, professional profiles, coding platforms, and project repositories.
2. **Manual verification:** Recruiters must open multiple links and manually inspect projects, technical profiles, and previous interview notes.
3. **Unclear skill evidence:** A resume may list a technology without providing sufficient evidence of relevant experience.
4. **Repeated evaluation:** Previous applications and interview feedback may not be readily available during subsequent hiring rounds.
5. **Inefficient job matching:** Recruiters must compare each candidate against the job description and determine which requirements are supported.
6. **Unstructured investigation:** Preparing candidate summaries and interview questions requires additional manual effort.

### 2.2 Product opportunity

Mosaic consolidates these signals into a unified candidate context and makes the evidence behind each finding accessible.

The objective is to reduce manual information gathering and help recruiters conduct more informed, consistent candidate evaluations.

## 3. Product Vision

**Beyond the Resume: turn fragmented candidate information into actionable, evidence-backed hiring context.**

Mosaic will function as an intelligence layer above recruitment data sources. It will combine internal candidate history, external professional signals, and role-specific requirements into a unified interface.

The product should answer five questions:

- What does the candidate claim?
- What available evidence supports that claim?
- How does the evidence relate to the current job?
- What remains unknown or requires validation?
- What should the recruiter investigate next?

## 4. Target Users and Personas

### 4.1 Recruiter / Talent Acquisition Specialist

**Needs**
- Find suitable candidates for a job opening.
- Review candidates without manually opening every source.
- Understand which requirements have supporting evidence.
- Generate concise candidate summaries.
- Prepare interviews efficiently.

**Primary workflow:** Select a job → review ranked candidates → investigate evidence → prepare the interview.

### 4.2 Hiring Manager

**Needs**
- Understand a candidate's technical background.
- Review evidence supporting important skills.
- Compare role requirements against demonstrated experience.
- Identify topics requiring technical validation.

**Primary workflow:** Open a candidate → review job alignment → inspect evidence → examine interview questions.

### 4.3 Recruitment Operations / HR Administrator

**Needs**
- Maintain candidate records and job information.
- Ensure appropriate access to sensitive data.
- Monitor data quality and source availability.
- Maintain an auditable record of candidate evaluations.

Administrative and access-control capabilities are proposed requirements for production use.

## 5. Product Scope

### 5.1 In scope

- Recruiter dashboard and job selection.
- Job description upload, text input, and extraction.
- Resume ingestion and structured candidate records.
- Candidate context aggregation.
- GitHub, LinkedIn, and LeetCode signal retrieval.
- Evidence scoring and source attribution.
- Job-description matching and candidate ranking.
- Candidate profile and original resume viewing.
- Company-specific application history and interview feedback.
- Candidate evidence exploration.
- AI-generated candidate briefs and interview questions.
- Conversational candidate intelligence agent.
- Knowledge graph visualization.
- Candidate and job search.
- Deployment and operational configuration.

### 5.2 Out of scope for the initial version

- Fully automated hiring decisions.
- Autonomous rejection or selection of candidates.
- Personality judgments based on public profiles.
- A definitive trustworthiness score.
- Guaranteed prediction of interview callbacks or job performance.
- Replacing an organization's entire ATS.
- Automated candidate outreach or interview scheduling.

These exclusions preserve the reference product's evidence-first design philosophy.

## 6. Core Product Workflows

### 6.1 Recruiter workflow

1. The recruiter opens Mosaic.
2. The recruiter selects an existing job or uploads/pastes a new job description.
3. Mosaic extracts job requirements and relevant skills.
4. The system evaluates available candidates against the requirements.
5. Candidate cards appear with ranking, requirement coverage, and evidence indicators.
6. The recruiter opens a candidate profile.
7. The recruiter reviews the resume, evidence, application history, and job match.
8. The recruiter generates a candidate brief or interview questions.
9. The recruiter uses the findings to support a human hiring decision.

### 6.2 Candidate investigation workflow

1. Open a candidate profile.
2. View the original resume and candidate overview.
3. Inspect the JD Match tab.
4. Open individual evidence cards to inspect sources and observations.
5. Explore the candidate's knowledge graph.
6. Generate an executive brief.
7. Generate interview questions targeting areas requiring validation.
8. Ask additional questions through the conversational agent.

### 6.3 Candidate data ingestion workflow

1. Add resume files in supported formats.
2. Extract resume text and available document links.
3. Parse candidate identity, experience, skills, projects, and claims.
4. Create structured candidate records.
5. Retrieve external signals where identifiers and access permit.
6. Cache successful retrievals.
7. Generate evidence cards and candidate context.
8. Optionally ingest candidate documents into the knowledge graph.

The reference architecture performs knowledge graph ingestion during seeding rather than during ordinary API requests.

## 7. Functional Requirements

### FR-01: Recruiter Dashboard

The system shall provide a recruiter workspace where users can select an existing job or provide a new job description.

**Requirements**
- Display searchable job openings.
- Support search by job ID, title, department, and location.
- Allow job description text input.
- Support job description file upload.
- Extract and display job requirements.
- Trigger candidate matching.
- Display candidate cards after matching completes.
- Support candidate name/email filtering.
- Support requirement-based filtering.
- Preserve the selected job when navigating between the dashboard and candidate profiles.

**Acceptance criteria**
- A recruiter can select an existing job and initiate matching.
- A recruiter can submit a pasted or uploaded job description.
- Matching results display the selected role and relevant requirements.
- Requirement filters update the visible candidate list.
- Navigation back to the dashboard restores recent results when available.

### FR-02: Resume Ingestion and Candidate Records

The system shall transform resumes into structured candidate records.

**Supported input formats**
- PDF
- DOCX
- TXT

**Extracted information**
- Candidate name and available contact information.
- Professional title and summary.
- Technical and professional skills.
- Employment history.
- Projects and technologies.
- Education and qualifications.
- Public profile links.
- Individual claims associated with relevant skills.

**Acceptance criteria**
- Supported resumes can be parsed into structured records.
- Extracted claims can be associated with the relevant candidate.
- Source documents remain accessible to authorized recruiters.
- Reprocessing a known resume does not create an unintended duplicate record.
- Extraction failures are reported without silently fabricating missing information.

### FR-03: External Signal Integration

The system shall retrieve available professional signals from supported external sources.

**Initial sources**
- GitHub
- LinkedIn or supported professional-profile search
- LeetCode

**GitHub signals**
- Public repositories.
- Repository descriptions and topics.
- Language composition.
- Recent activity where available.
- Relevant repository evidence.

**LinkedIn signals**
- Available headline and profile information.
- Identity confirmation against the supplied profile URL.
- Professional information retrieved through supported sources.

**LeetCode signals**
- Available coding activity and solved-problem information.
- Language-specific activity where the source provides it.

**Acceptance criteria**
- Each source reports whether retrieval succeeded.
- Failed or unavailable sources do not crash the candidate context workflow.
- Cached successful results can be reused.
- Source timestamps and retrieval limitations are recorded.
- A missing profile or inaccessible repository is not treated as proof of dishonesty.
- Identity mismatches are clearly identified.

External integrations must respect applicable access policies, rate limits, and provider terms.

### FR-04: Evidence Scoring Engine

The system shall evaluate the strength of available evidence supporting individual resume claims.

The reference implementation uses deterministic scoring based on evidence weights and recency.

**Reference scoring model**

| Signal | Weight |
|---|---:|
| Matching GitHub repository language | 3 |
| Submitted project stack | 3 |
| Positive interview feedback | 3 |
| GitHub repository mention | 2 |
| Recent matching GitHub activity | 2 |
| LeetCode activity in a language | 1 |
| LinkedIn headline/about mention | 1 |
| Negative interview feedback | 0 |

Recency multipliers:

| Evidence age | Multiplier |
|---|---:|
| Less than 6 months | 1.0 |
| 6–18 months | 0.7 |
| 18–36 months | 0.4 |
| More than 36 months | 0.2 |
| Undated | 0.7 |

Reference evidence labels:

| Raw score | Label |
|---|---|
| 0 | No public evidence |
| 1–2 | Limited |
| 3–5 | Some |
| 6–9 | Good |
| 10+ | Strong |

These weights and thresholds are initial heuristics, not empirically validated measures of competence.

**Requirements**
- Calculate scores deterministically.
- Maintain an evidence trail for every scored claim.
- Record source, observation, weight, recency, and date where available.
- Count independent sources separately from raw score.
- Use consistent skill aliases for matching.
- Distinguish missing resume claims from missing supporting evidence.
- Keep the LLM responsible for explanation rather than score calculation.

**Acceptance criteria**
- Identical inputs produce identical numeric results.
- Every evidence score can be traced to its underlying observations.
- The interface explains the evidence label.
- Unsupported claims are not automatically marked false.
- Evidence scoring and claim-verification status remain conceptually distinct.

### FR-05: Candidate Context

The system shall assemble candidate information into a unified context object.

The context shall contain:

- Candidate identity.
- Professional summary and work history.
- Resume claims.
- Company-specific application history.
- Interview feedback.
- Projects and platform records.
- External professional signals.
- Evidence cards.
- Identified information gaps.
- Optional graph-completion context.

The context object shall serve as the common input for downstream features, including JD matching, briefs, interview questions, ranking, and conversational queries.

**Acceptance criteria**
- All candidate-facing features use consistent candidate context.
- The system distinguishes internal platform data from external sources.
- Missing information is represented explicitly.
- Context caching improves repeat requests without permanently hiding refreshed evidence.
- Graph functionality can be disabled without breaking the direct context workflow.

### FR-06: Job Description Matching

The system shall evaluate candidates against individual job requirements.

**Requirements**
- Extract approximately 5–10 relevant requirements from a job description where appropriate.
- Distinguish mandatory and preferred requirements.
- Match requirements against resume claims and external evidence.
- Produce one result per requirement.
- Show matched, partially supported, and insufficiently evidenced requirements.
- Generate a concise narrative grounded in the underlying evidence.

**Acceptance criteria**
- Recruiters can inspect the evidence behind an individual requirement.
- Requirements absent from the resume can still be checked against available external signals.
- The interface distinguishes resume coverage from external evidence.
- AI-generated explanations do not invent numeric scores or unsupported facts.

### FR-07: Candidate Ranking

The system shall rank candidates against a selected job description.

The reference scoring formula is:

`Final score = 0.5 × Resume fit + 0.5 × Evidence strength`

Where:
- Resume fit measures the proportion of extracted requirements covered by resume claims.
- Evidence strength measures normalized supporting evidence across requirements.

The exact production scoring methodology remains subject to evaluation.

**Requirements**
- Parse the JD once per matching operation where possible.
- Evaluate all available candidates.
- Display ranking and component-level metrics.
- Explain the ranking using requirement-level evidence.
- Handle missing sources and incomplete candidate records.
- Avoid treating public activity volume as a direct measure of candidate quality.

**Acceptance criteria**
- Scores are reproducible for identical inputs.
- Recruiters can inspect the factors contributing to the ranking.
- Inaccessible public evidence does not automatically become a negative character judgment.
- Ranking quality is tested against manually reviewed examples before production use.

### FR-08: Candidate Profile

The candidate profile shall present the original resume and supporting candidate information.

**Required sections**
1. Overview.
2. JD Match.
3. Evidence.
4. Knowledge Graph.
5. Brief & Questions.

**Overview**
- Candidate identity and professional background.
- Primary technical stack.
- Employment and application history.
- Previous interview feedback.
- External signals and information gaps.

**JD Match**
- Requirement coverage.
- Requirement-level evidence.
- Match narrative.
- Expandable evidence details.

**Evidence**
- Individual claims.
- Evidence label.
- Supporting source count.
- Source trail and observation details.

**Knowledge Graph**
- Candidate-related documents and extracted entities.
- Relationships between skills, projects, applications, and evidence.
- JD-to-entity matching.

**Brief & Questions**
- Evidence-backed executive summary.
- Gap-driven interview questions.

### FR-09: Conversational AI Agent

The system shall provide a conversational assistant that understands the current candidate and selected job.

**Supported questions**
- What evidence supports this candidate's skills?
- How does the candidate align with this job?
- Which requirements have insufficient evidence?
- Has the candidate applied to this organization before?
- What should be validated during the interview?
- What information is unavailable?

**Requirements**
- Use candidate context when available.
- Resolve candidate identity before answering questions about stored candidates.
- Ask for clarification when candidate identity is ambiguous.
- Cite sources in answers.
- Use tools for candidate resolution, context retrieval, company history, evidence retrieval, and JD matching.
- Restrict the tool-calling loop to a defined number of rounds.
- Support configured LLM providers and fallback behavior.

**Acceptance criteria**
- Candidate-specific claims are grounded in retrieved context.
- The agent distinguishes unavailable information from negative findings.
- Unsupported facts are not presented as verified.
- LLM failure does not crash deterministic matching functionality.

### FR-10: Executive Brief and Interview Questions

The system shall generate recruiter-ready summaries and interview preparation material.

**Executive brief**
- Relevant professional background.
- Job-specific strengths.
- Supporting evidence.
- Areas with limited evidence.
- Previous company interactions where available.
- Questions requiring further investigation.

**Interview questions**
- Target requirements with insufficient evidence.
- Clarify ambiguous resume claims.
- Investigate relevant technical depth.
- Explore recurring interview-feedback themes where appropriate.
- Validate role-specific experience.

**Acceptance criteria**
- Every factual assertion in the brief has source attribution.
- Questions relate to the candidate's claims or job requirements.
- The system does not invent interview history or feedback.
- Generated content remains advisory.

### FR-11: Knowledge Graph

The system shall optionally use Cognee and Neo4j to represent candidate information and relationships.

**Requirements**
- Ingest separate candidate documents for traceability.
- Keep candidate datasets isolated.
- Connect document chunks with extracted entities.
- Retrieve candidate-specific subgraphs.
- Match JD requirements to graph entities.
- Provide source-document references for matched entities.
- Support graph-based candidate exploration.

Graph ingestion shall occur during the seeding process, not during ordinary API requests.

### FR-12: Search and Related Jobs

The system shall support:
- Searching existing job openings.
- Retrieving job descriptions.
- Finding similar job openings using requirement overlap.
- Excluding identical job descriptions from similarity results.
- Showing alternative openings relevant to the selected role.

### FR-13: Data Refresh and Caching

The system shall cache successfully retrieved external signals to reduce repeated requests and improve demo reliability.

**Requirements**
- Cache data by source and profile handle.
- Refresh signals through an explicit refresh workflow.
- Record retrieval timestamps.
- Handle provider outages gracefully.
- Allow candidate context caches to be invalidated after updates.
- Avoid overwriting useful cached data with failed responses.

### FR-14: Theme and User Interface

The interface shall support light and dark themes.

The visual direction should follow the supplied Mosaic reference:
- Recruiter-first dashboard.
- Candidate cards with evidence indicators.
- Original resume displayed alongside candidate context.
- Expandable evidence cards.
- Interactive knowledge graph.
- Animated JD-to-candidate matching visualization.
- Floating conversational assistant.
- Responsive layouts and reduced-motion support.

Visual styling must not reduce readability or make evidence labels ambiguous.

## 8. Non-Functional Requirements

### Performance
- Reuse cached context and matching results where appropriate.
- Run independent ranking and graph requests concurrently.
- Show loading and failure states during asynchronous operations.
- Establish measurable latency targets after baseline testing.

### Reliability
- External provider failures must be handled independently.
- Deterministic matching must remain usable when an LLM provider fails.
- Graph features must degrade gracefully when graph infrastructure is unavailable.

### Security
- Keep API keys and credentials outside source control.
- Require authentication and authorization before real candidate data is exposed.
- Apply least-privilege access.
- Protect candidate documents and profile data.
- Maintain access and modification audit logs.

### Privacy
- Use synthetic candidate data during development and public demonstrations.
- Define data retention and deletion policies.
- Limit access to sensitive candidate information.
- Respect provider terms and candidate data rights.
- Avoid using candidate data for unrelated model training without appropriate permission.

### Explainability
- Link factual claims to their source.
- Display observation timestamps where available.
- Separate evidence strength from verification status.
- Avoid opaque trust scores and automatic hiring decisions.

### Maintainability
- Separate data fetching, evidence scoring, context construction, LLM orchestration, and API routes.
- Use typed API contracts.
- Keep the direct context engine independent of optional graph dependencies.
- Include automated tests for scoring, matching, and data handling.

## 9. Technical Architecture

### Frontend

React 19, TypeScript, and Vite.

Major components:
- Recruiter dashboard.
- Candidate profile.
- Candidate cards.
- Evidence cards and evidence bars.
- Graph visualization.
- Live JD matching graph.
- Conversational chat panel.
- Shared JD and theme state.

### Backend

Python and FastAPI.

Major modules:
- API routes and request models.
- Candidate store.
- Job search and matching.
- Resume parsing and seeding.
- External signal fetchers.
- Evidence scoring.
- Candidate context construction.
- LLM provider abstraction.
- Agent tools and conversational orchestration.
- Graph retrieval and matching.

### AI and context

- Gemini as the primary LLM.
- Groq as a fallback.
- Optional local Ollama fallback during development.
- Cognee for graph ingestion and context processing.
- Neo4j Aura for graph storage and retrieval.
- Deterministic scoring for numerical evidence evaluation.

### Initial data storage

The supplied reference uses JSON candidate and job records, disk-based signal caches, and a candidate store loaded into memory.

**Production requirement:** replace or extend prototype storage with persistent candidate, job, evidence, and audit records before using real hiring data at scale.

## 10. API Requirements

The implementation should preserve the reference endpoint structure where appropriate.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health and configuration |
| GET | `/candidates` | List candidates |
| GET | `/candidates/resolve` | Resolve candidate identity |
| GET | `/candidates/{id}/context` | Retrieve candidate context |
| GET | `/candidates/{id}/resume` | Retrieve original resume |
| GET | `/candidates/{id}/graph` | Retrieve candidate graph |
| POST | `/candidates/{id}/jd-match` | Evaluate candidate against JD |
| POST | `/candidates/{id}/brief` | Generate executive brief |
| POST | `/candidates/{id}/interview-questions` | Generate interview questions |
| POST | `/candidates/{id}/graph-evidence` | Generate graph-backed evidence |
| POST | `/agent/chat` | Conversational agent |
| GET | `/jobs` | Search jobs |
| GET | `/jobs/{job_id}` | Retrieve a job |
| POST | `/jd/rank` | Rank candidates against JD |
| POST | `/jd/graph` | Build cross-candidate graph matching |
| POST | `/jd/similar` | Find similar job openings |
| POST | `/jd/extract` | Extract text from JD files |
| GET | `/jds` | Retrieve legacy/sample JDs |
| POST | `/seed/rebuild` | Reload candidate data and clear caches |

Additional authentication, persistence, audit, and administration endpoints may be introduced during production hardening.

## 11. Data Model

The following logical entities are required.

### Candidate
- Candidate ID.
- Identity and contact information.
- Resume reference.
- Professional background.
- Skills and claims.
- External profile identifiers.

### Resume Claim
- Claim ID.
- Candidate ID.
- Claim text.
- Associated skill.
- Resume source location where available.

### Evidence Record
- Evidence ID.
- Candidate ID.
- Related claim or requirement.
- Source type and source URL.
- Observation.
- Retrieval timestamp.
- Evidence weight and recency.
- Evidence label.
- Independent-source identifier where available.

### Job
- Job ID.
- Title.
- Department.
- Location.
- Job description.
- Extracted requirements.

### Application History
- Application ID.
- Candidate ID.
- Job ID.
- Application stage.
- Relevant dates.
- Interview feedback.
- Outcome.

### Match Result
- Candidate ID.
- Job ID or JD reference.
- Requirement-level results.
- Resume-fit component.
- Evidence-strength component.
- Overall ranking score.
- Explanation and supporting references.

These entities describe the target logical model; the reference prototype does not yet provide a fully persistent production database.

## 12. Success Metrics

Initial product success should be measured using the following metrics.

### Product usage
- Number of jobs evaluated.
- Number of candidates reviewed.
- Number of evidence cards opened.
- Number of briefs and interview-question sets generated.
- Recruiter return usage.

### Efficiency
- Time required to review a candidate before and after Mosaic.
- Manual source checks reduced per candidate.
- Time required to prepare interview questions.
- Percentage of successful candidate context requests.

### Evidence quality
- Precision of extracted resume claims.
- Accuracy of evidence-source attribution.
- Agreement between evidence labels and human reviewers.
- Rate of stale or unavailable source data.
- Rate of unsupported statements in generated briefs.

### Matching quality
- Agreement between system matching and expert-reviewed requirement matches.
- Ranking consistency on repeated identical inputs.
- Performance across candidates with different levels of public activity.

Targets should be established after collecting baseline results from representative test cases. No current performance metrics are assumed by this PRD.

## 13. Testing and Acceptance Strategy

### Unit tests
- Evidence-weight calculations.
- Recency multipliers.
- Skill alias matching.
- Candidate identity resolution.
- JD requirement extraction fallback.
- Ranking calculations.
- Cache invalidation.

### Integration tests
- Resume parsing to candidate record.
- Candidate record to context object.
- Context object to evidence cards.
- JD input to candidate ranking.
- Agent tool calls and source-grounded responses.
- Graph retrieval and requirement matching.
- External provider failure handling.

### User acceptance tests
- Recruiter selects a job and obtains results.
- Recruiter filters candidates by required skills.
- Recruiter inspects evidence for a specific claim.
- Recruiter reviews a candidate's original resume.
- Recruiter generates an executive brief.
- Recruiter generates interview questions.
- Recruiter can distinguish missing evidence from a negative finding.

### Safety and quality tests
- Ambiguous candidate names do not resolve silently to the wrong person.
- LLM output cannot modify deterministic scores.
- Missing external evidence does not imply dishonesty.
- Fabricated demo data is clearly separated from real data.
- Candidate data is inaccessible to unauthorized users.

## 14. Implementation Roadmap

### Phase 1 — Core recruiter experience
- Dashboard and job selection.
- JD input and extraction.
- Candidate cards and filtering.
- Candidate profile navigation.
- Theme support and responsive layout.

### Phase 2 — Candidate context
- Resume ingestion.
- Structured candidate records.
- External signal fetching.
- Candidate context object.
- Evidence cards and source trails.

### Phase 3 — Matching and ranking
- JD requirement extraction.
- Requirement-level evidence evaluation.
- Deterministic ranking.
- Match explanations.
- Similar-job search.

### Phase 4 — AI agent and graph
- Candidate-aware chat.
- Executive briefs.
- Interview questions.
- Neo4j graph retrieval.
- Cognee ingestion and graph-backed matching.

### Phase 5 — Production readiness
- Persistent database.
- Authentication and role-based access.
- Data refresh and source-freshness controls.
- Audit logs.
- Privacy and deletion workflows.
- Evaluation suite and deployment monitoring.

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Public profiles do not prove skill proficiency | Present evidence as support, not conclusive proof |
| Inaccessible sources | Mark unavailable or unassessed |
| Stale external data | Track timestamps and support refresh |
| Candidate identity mismatch | Validate supplied profile identifiers |
| LLM hallucinations | Ground explanations in retrieved evidence |
| Ranking bias toward public activity | Separate resume fit from evidence availability and evaluate outcomes |
| Provider rate limits or outages | Use caching and fail-soft retrieval |
| Sensitive candidate information exposure | Add authentication, access control, retention, and audit mechanisms |
| Poor-quality evidence scoring | Validate weights and thresholds against reviewed examples |
| Prototype storage limitations | Introduce persistent storage before production deployment |

## 16. Assumptions and Open Questions

The following decisions remain open and should be confirmed during implementation:

1. Whether the first release is a standalone recruiter workspace or integrates with an existing ATS.
2. Which ATS integrations are required first.
3. Which external providers permit the required retrieval methods.
4. Whether candidate records will be uploaded manually or imported from an ATS.
5. Which persistent database will be used for production.
6. What access roles are required for recruiters, hiring managers, and administrators.
7. How long candidate records and source evidence should be retained.
8. What evidence-quality thresholds should be accepted for each source type.
9. Whether knowledge graph functionality is required for the first MVP or can follow the direct context engine.
10. Which measurable time-saving and evidence-quality targets will define release readiness.

## 17. Product Principles

Mosaic shall follow these principles throughout development:

- Evidence over assumptions.
- Context over isolated fields.
- Source attribution over unsupported assertions.
- Deterministic numerical scoring over LLM-generated scores.
- Missing evidence is not proof of dishonesty.
- Public activity is not a complete measure of professional ability.
- Human judgment remains central to hiring decisions.
- Candidate privacy and data security are fundamental requirements.

## 18. Definition of Done

The initial product is ready for controlled demonstration when:

- A recruiter can select or submit a job description.
- The system can evaluate seeded candidate records against the job.
- Candidate rankings and requirement-level results are reproducible.
- Recruiters can inspect evidence sources for individual claims.
- Candidate profiles show the original resume and consolidated context.
- The AI agent generates source-grounded answers.
- Executive briefs and interview questions are available.
- External-source failures are handled gracefully.
- Synthetic data is clearly distinguished from real candidate information.
- Automated tests cover the critical evidence and matching logic.

Production readiness additionally requires persistent storage, authentication, authorization, auditability, privacy controls, and an evaluation process for evidence quality and ranking behavior.

---

**Final product definition**

Mosaic is an evidence-backed candidate intelligence platform that connects resumes, professional signals, hiring history, and job requirements to help recruiters understand candidates more efficiently and make better-informed hiring decisions.

**Core workflow:** Job requirements → Candidate matching → Evidence exploration → Candidate context → Interview preparation → Human hiring decision.
