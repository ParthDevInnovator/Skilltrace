export interface ChatMessage { role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }
export interface AgentResponse { assistant_message: string; tool_calls_made: number; provider_used: string; grounding_ids: string[] }
export interface CandidateBrief { candidate_id: string; job_id: string | null; generated_at: string; provider_used: string; strengths: string; evidence_summary: string; application_history_notes: string; identified_gaps: string; grounding_ids: string[] }
export interface InterviewQuestion { question_text: string; target_type: 'unverified_claim' | 'coverage_gap' | 'history_probe'; source_id: string; rationale: string }
export interface InterviewQuestionSet { candidate_id: string; job_id: string; generated_at: string; provider_used: string; questions: InterviewQuestion[]; grounding_ids: string[] }
export interface GraphNode { id: string; label: 'Candidate' | 'Skill' | 'Repository' | 'Job' | 'Requirement'; properties: Record<string, unknown> }
export interface GraphEdge { source_id: string; target_id: string; relationship: string }
export interface CandidateSubgraph { nodes: GraphNode[]; edges: GraphEdge[] }
export type GenerationResult<T> = T | { status: 'building' } | { status: 'failed'; error?: string }
