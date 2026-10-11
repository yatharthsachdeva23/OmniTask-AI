from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field

class DomainType(str, Enum):
    CODE = "code"
    MATH = "math"
    VISION = "vision"
    AUDIO = "audio"
    VIDEO = "video"
    AUDIT = "audit"
    GENERAL = "general"

class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    REVIEWING = "reviewing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRIED = "retried"

class ReviewStatus(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    WARNING = "warning"

class IngestedFile(BaseModel):
    filename: str
    content_type: str = "text/plain"
    size_bytes: int = 0
    preview_or_content: str = ""

class TaskRequest(BaseModel):
    prompt: str
    files: List[IngestedFile] = Field(default_factory=list)
    mode: str = "paid"  # "paid" for Omni Execution, "free" for Advisor
    delivery_mode: str = "smart"  # "smart" (default, formerly overdeliver) or "strict"
    allow_simulation: bool = True
    ask_before_doing: bool = True
    user_clarifications: Optional[Dict[str, str]] = None
    approved_plan_summary: Optional[str] = None
    chat_id: Optional[str] = None
    user_id: Optional[str] = "default_user"

class StructuredSubTask(BaseModel):
    step_id: str
    title: str
    domain: DomainType
    description: str
    assigned_worker_model: str
    assigned_reviewer_model: str
    required_prerequisites: List[str] = Field(default_factory=list)
    expected_output_type: str
    retry_count: int = 0
    status: TaskStatus = TaskStatus.PENDING
    is_dynamically_added: bool = False
    dynamic_insertion_reason: Optional[str] = None
    parent_step_id: Optional[str] = None

class StructuredGoal(BaseModel):
    primary_objective: str
    prerequisites: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    sub_tasks: List[StructuredSubTask] = Field(default_factory=list)
    jev_routing_latency_ms: float = 0.0
    jev_confidence: float = 0.98

class WorkerResult(BaseModel):
    step_id: str
    worker_model: str
    domain: DomainType
    output_text: str
    user_deliverable: Optional[str] = None
    internal_handover: Dict[str, Any] = Field(default_factory=dict)
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    execution_time_ms: float = 0.0
    attempt: int = 1
    success: bool = True

class IntermediateReviewResult(BaseModel):
    step_id: str
    reviewer_model: str
    status: ReviewStatus
    quality_score: int  # 0 to 100
    critique: str
    recommendations: List[str] = Field(default_factory=list)
    reviewer_regenerate_prompt: Optional[str] = None
    passed: bool = True
    mitigation_required: bool = False
    requires_additional_agent: bool = False
    additional_agent_spec: Optional[Dict[str, Any]] = None

class NegativeKnowledgeItem(BaseModel):
    step_id: str
    stage: str
    issue_type: str
    description: str
    mitigation_applied: str
    prevention_directive_for_downstream: str

class BlackboardState(BaseModel):
    session_id: str
    original_prompt: str
    structured_goal: Optional[StructuredGoal] = None
    global_prerequisites: List[str] = Field(default_factory=list)
    completed_outputs: Dict[str, WorkerResult] = Field(default_factory=dict)
    inter_agent_handovers: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    intermediate_reviews: Dict[str, IntermediateReviewResult] = Field(default_factory=dict)
    negative_knowledge: List[NegativeKnowledgeItem] = Field(default_factory=list)
    current_step_id: Optional[str] = None
    audit_trail: List[Dict[str, Any]] = Field(default_factory=list)

class FinalEvaluationResult(BaseModel):
    overall_completion_score: int  # e.g., 94%
    compliance_breakdown: Dict[str, int] = Field(default_factory=dict)
    internal_audit_notes: List[str] = Field(default_factory=list)
    summary_for_user: str
    deliverables: Dict[str, Any] = Field(default_factory=dict)
    delivery_mode: str = "smart"  # "smart" or "strict"
    anticipated_blind_spots: List[str] = Field(default_factory=list)
    complimentary_starter_pack: Dict[str, Any] = Field(default_factory=dict)

# Track 1 Models
class PhasePrompt(BaseModel):
    phase: int
    phase_title: str = ""
    prompt: str

class ToolRecommendation(BaseModel):
    category: str
    tool_name: str
    provider: str
    description: str
    why_recommended: str
    sample_prompt: str = ""
    is_free: bool = False
    pricing_tier: str
    assigned_phases: List[int] = Field(default_factory=list)
    phase_prompts: List[PhasePrompt] = Field(default_factory=list)

class AdvisorResponse(BaseModel):
    original_query: str
    task_decomposition: List[str]
    recommendations: List[ToolRecommendation]
    diy_execution_blueprint: List[Dict[str, Any]]
    delivery_mode: str = "smart"  # "smart" or "strict"
    anticipated_blind_spots: List[str] = Field(default_factory=list)
    complimentary_starter_pack: Dict[str, Any] = Field(default_factory=dict)

# Interactive Planning Models (Ask Before Doing)
class PlanClarifyingQuestion(BaseModel):
    id: str
    question: str
    options: List[str] = Field(default_factory=list)
    default_selected: Optional[str] = None
    allow_custom: bool = True

class ImplementationStepPlan(BaseModel):
    step_number: int
    title: str
    domain: DomainType
    assigned_worker: str
    description: str
    expected_output: str

class InteractivePlanResponse(BaseModel):
    objective_summary: str
    architectural_approach: str
    assumptions: List[str] = Field(default_factory=list)
    steps: List[ImplementationStepPlan] = Field(default_factory=list)
    clarifying_questions: List[PlanClarifyingQuestion] = Field(default_factory=list)
    suggested_focus: str = ""

# ==========================================
# Multi-Turn Chat & Conversation History Models
# ==========================================
class ChatMessage(BaseModel):
    id: str
    role: str  # "user" | "assistant"
    content: str
    timestamp: float
    files: List[IngestedFile] = Field(default_factory=list)
    delivery_mode: Optional[str] = "smart"
    clarifications: Optional[Dict[str, str]] = None
    approved_plan_summary: Optional[str] = None
    execution_data: Optional[Dict[str, Any]] = None  # Contains stage, subtasks, worker results, deliverables, blackboard

class ChatSessionMeta(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    message_count: int = 0
    preview: str = ""

class ChatSession(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    messages: List[ChatMessage] = Field(default_factory=list)
    blackboard_state: Optional[Dict[str, Any]] = None
    latest_evaluation: Optional[Dict[str, Any]] = None
    delivery_mode: str = "smart"
    user_id: Optional[str] = "default_user"

class ChatUpdateRequest(BaseModel):
    title: Optional[str] = None

