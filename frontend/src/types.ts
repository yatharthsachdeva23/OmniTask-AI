export interface IngestedFile {
  filename: string;
  content_type: string;
  size_bytes: number;
  preview_or_content: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface StructuredSubTask {
  step_id: string;
  title: string;
  domain: string;
  description: string;
  assigned_worker_model: string;
  assigned_reviewer_model: string;
  required_prerequisites: string[];
  expected_output_type: string;
  retry_count?: number;
  status: TaskStatus;
}

export interface StructuredGoal {
  primary_objective: string;
  prerequisites: string[];
  constraints: string[];
  sub_tasks: StructuredSubTask[];
  jev_routing_latency_ms: number;
  jev_confidence: number;
}

export interface WorkerResult {
  step_id: string;
  worker_model: string;
  domain: string;
  output_text: string;
  user_deliverable?: string;
  internal_handover?: Record<string, any>;
  artifacts: Record<string, any>;
  execution_time_ms: number;
  attempt?: number;
  success: boolean;
}

export interface IntermediateReviewResult {
  step_id: string;
  reviewer_model: string;
  status: 'approved' | 'rejected' | 'warning';
  quality_score: number;
  critique: string;
  recommendations: string[];
  reviewer_regenerate_prompt?: string;
  passed: boolean;
  mitigation_required: boolean;
}

export interface NegativeKnowledgeItem {
  step_id: string;
  stage: string;
  issue_type: string;
  description: string;
  mitigation_applied: string;
  prevention_directive_for_downstream: string;
}

export type DeliveryMode = 'smart' | 'strict' | 'overdeliver';

export interface FinalEvaluationResult {
  overall_completion_score: number;
  compliance_breakdown: Record<string, number>;
  internal_audit_notes: string[];
  summary_for_user: string;
  deliverables: Record<string, any>;
  delivery_mode?: DeliveryMode;
  anticipated_blind_spots?: string[];
}

export interface BlackboardSnapshot {
  session_id: string;
  original_prompt: string;
  structured_goal?: StructuredGoal;
  global_prerequisites: string[];
  completed_outputs: Record<string, WorkerResult>;
  intermediate_reviews: Record<string, IntermediateReviewResult>;
  negative_knowledge: NegativeKnowledgeItem[];
  inter_agent_handovers?: Record<string, Record<string, any>>;
  current_step_id?: string;
  audit_trail: Array<{
    timestamp: number;
    event_type: string;
    message: string;
  }>;
}

export interface PhasePrompt {
  phase: number;
  phase_title?: string;
  prompt: string;
}

export interface ToolRecommendation {
  category: string;
  tool_name: string;
  provider: string;
  description: string;
  why_recommended: string;
  sample_prompt: string;
  is_free: boolean;
  pricing_tier: string;
  assigned_phases?: number[];
  phase_prompts?: PhasePrompt[];
}

export interface AdvisorResponse {
  original_query: string;
  task_decomposition: string[];
  recommendations: ToolRecommendation[];
  diy_execution_blueprint: Array<{
    step: number;
    action: string;
    recommended_tool: string;
    instruction?: string;
    input?: string;
    expected_output?: string;
  }>;
  delivery_mode?: DeliveryMode;
  anticipated_blind_spots?: string[];
}

export interface PlanClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
  default_selected?: string;
  allow_custom?: boolean;
}

export interface ImplementationStepPlan {
  step_number: number;
  title: string;
  domain: string;
  assigned_worker: string;
  description: string;
  expected_output: string;
}

export interface InteractivePlanResponse {
  objective_summary: string;
  architectural_approach: string;
  assumptions: string[];
  steps: ImplementationStepPlan[];
  clarifying_questions: PlanClarifyingQuestion[];
  suggested_focus?: string;
}

// Multi-turn Session Memory Interfaces
export interface SessionMemoryTurnCandidate {
  turn_index: number;
  raw: number;
  amplified: number;
}

export interface SessionMemoryExcerpt {
  turn_index: number;
  role: string;
  heading: string;
  content: string;
  score: number;
}

export interface SessionMemoryActiveGrounding {
  matched_turn_index: number;
  is_immediate_preceding: boolean;
  raw_confidence: number;
  amplified_confidence: number;
  raw_gap?: number;
  candidates_summary?: SessionMemoryTurnCandidate[];
}

export interface SessionMemoryState {
  chat_id: string;
  has_prior_context: boolean;
  active_turn_grounding?: SessionMemoryActiveGrounding | null;
  retrieved_excerpts?: SessionMemoryExcerpt[];
  compressed_history?: string;
  recent_context_preview?: string;
  total_indexed_chunks?: number;
}

// Multi-turn Chat Interfaces
export interface ChatExecutionData {
  session_id: string;
  stage?: string;
  structured_goal?: StructuredGoal;
  final_evaluation?: FinalEvaluationResult;
  blackboard_state?: BlackboardSnapshot;
  session_memory?: SessionMemoryState;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  files?: IngestedFile[];
  delivery_mode?: DeliveryMode;
  clarifications?: Record<string, string>;
  approved_plan_summary?: string;
  execution_data?: ChatExecutionData;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  preview: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: ChatMessage[];
  blackboard_state?: BlackboardSnapshot;
  latest_evaluation?: FinalEvaluationResult;
  latest_session_memory?: SessionMemoryState;
  delivery_mode: DeliveryMode;
}
