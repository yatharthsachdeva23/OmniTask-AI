import time
from typing import Dict, Any, List, Optional
from app.models.schemas import (
    BlackboardState,
    StructuredGoal,
    WorkerResult,
    IntermediateReviewResult,
    NegativeKnowledgeItem,
    IngestedFile,
)

class CommonContextBlackboard:
    """
    Common Context Window & Shared Blackboard Memory.
    Acts as the centralized single source of truth across all sub-agents.
    Eliminates context amnesia, hallucination, and repeated mistakes.
    """
    def __init__(self, session_id: str, original_prompt: str):
        self.session_id = session_id
        self.original_prompt = original_prompt
        self.structured_goal: Optional[StructuredGoal] = None
        self.global_prerequisites: List[str] = []
        self.ingested_files: List[IngestedFile] = []
        self.completed_outputs: Dict[str, WorkerResult] = {}
        self.inter_agent_handovers: Dict[str, Dict[str, Any]] = {}
        self.intermediate_reviews: Dict[str, IntermediateReviewResult] = {}
        self.negative_knowledge: List[NegativeKnowledgeItem] = []
        self.current_step_id: Optional[str] = None
        self.chat_context_package: Optional[Dict[str, Any]] = None
        self.user_global_memory: str = ""
        self.audit_trail: List[Dict[str, Any]] = []
        self._log_audit("INITIALIZE", f"Blackboard created for session {session_id}")

    def _log_audit(self, event_type: str, message: str, metadata: Optional[Dict[str, Any]] = None):
        self.audit_trail.append({
            "timestamp": time.time(),
            "event_type": event_type,
            "message": message,
            "metadata": metadata or {}
        })

    def set_structured_goal(self, goal: StructuredGoal, files: List[IngestedFile]):
        self.structured_goal = goal
        self.ingested_files = files
        self.global_prerequisites = list(goal.prerequisites)
        if files:
            for f in files:
                self.global_prerequisites.append(f"Ingested file: {f.filename} ({f.size_bytes} bytes)")
        self._log_audit("STRUCTURED_GOAL_SET", f"Structured goal with {len(goal.sub_tasks)} tasks initialized")

    def load_prior_chat_state(self, prior_blackboard_dict: Optional[Dict[str, Any]] = None):
        """
        Rehydrates blackboard with outputs, handovers, and negative knowledge
        from previous chat turns for 100% conversational multi-turn continuity.
        """
        if not prior_blackboard_dict:
            return

        # Rehydrate completed outputs
        completed = prior_blackboard_dict.get("completed_outputs", {})
        for step_id, out_data in completed.items():
            if isinstance(out_data, dict) and step_id not in self.completed_outputs:
                try:
                    self.completed_outputs[step_id] = WorkerResult(**out_data)
                except Exception:
                    pass

        # Rehydrate handovers
        handovers = prior_blackboard_dict.get("inter_agent_handovers", {})
        for step_id, h_data in handovers.items():
            if isinstance(h_data, dict):
                self.inter_agent_handovers[step_id] = h_data

        # Rehydrate negative knowledge
        neg_items = prior_blackboard_dict.get("negative_knowledge", [])
        for item in neg_items:
            if isinstance(item, dict):
                try:
                    self.negative_knowledge.append(NegativeKnowledgeItem(**item))
                except Exception:
                    pass

        self._log_audit("CHAT_CONTINUITY_LOADED", f"Rehydrated {len(completed)} prior outputs from chat history")

    def set_chat_context_package(self, package: Optional[Dict[str, Any]]):
        """Attaches the RAG-retrieved and compressed chat memory package."""
        self.chat_context_package = package
        if package and package.get("has_prior_context"):
            self._log_audit("CHAT_CONTEXT_ATTACHED", "Chat context package & RAG memory attached to blackboard")

    def set_user_global_memory(self, memory_text: str):
        """Attaches persistent user memory across all chats."""
        self.user_global_memory = memory_text or ""
        if self.user_global_memory:
            self._log_audit("PERSISTENT_MEMORY_ATTACHED", "Persistent cross-chat user memory attached to blackboard")

    def get_context_for_subagent(self, step_id: str) -> Dict[str, Any]:
        """
        Supplies the sub-agent with everything it needs before starting:
        - Baseline objective and constraints
        - Global prerequisites & ingested file references
        - Previous step outputs & inter-agent handovers
        - NEGATIVE KNOWLEDGE: warnings, past errors, and avoidance directives
        """
        target_subtask = None
        if self.structured_goal:
            for st in self.structured_goal.sub_tasks:
                if st.step_id == step_id:
                    target_subtask = st
                    break

        # Compile previous verified outputs and handovers
        prior_knowledge = {}
        for prev_step_id, worker_res in self.completed_outputs.items():
            review = self.intermediate_reviews.get(prev_step_id)
            handover = worker_res.internal_handover or self.inter_agent_handovers.get(prev_step_id, {})
            prior_knowledge[prev_step_id] = {
                "domain": worker_res.domain,
                "summary": worker_res.output_text[:300] + ("..." if len(worker_res.output_text) > 300 else ""),
                "full_output": worker_res.output_text,
                "artifacts": worker_res.artifacts,
                "handover": handover,
                "review_score": review.quality_score if review else 100,
                "review_critique": review.critique if review else "Approved without remarks"
            }

        # Curate negative knowledge directives
        avoidance_rules = [
            f"[{item.stage.upper()}] Note: {item.description} -> Directive: {item.prevention_directive_for_downstream}"
            for item in self.negative_knowledge
        ]

        context_packet = {
            "session_id": self.session_id,
            "original_user_prompt": self.original_prompt,
            "primary_objective": self.structured_goal.primary_objective if self.structured_goal else self.original_prompt,
            "constraints": self.structured_goal.constraints if self.structured_goal else [],
            "global_prerequisites": self.global_prerequisites,
            "current_step": target_subtask.model_dump() if target_subtask else {"step_id": step_id},
            "cumulative_prior_outputs": prior_knowledge,
            "cumulative_handovers": self.inter_agent_handovers,
            "negative_knowledge_avoidance_rules": avoidance_rules,
            "user_global_memory": self.user_global_memory,
            "retrieved_rag_chunks": self.chat_context_package.get("rag_excerpts_text", "") if self.chat_context_package else "",
            "recent_prior_deliverables": self.chat_context_package.get("recent_deliverables_text", "") if self.chat_context_package else "",
            "compressed_chat_memory": self.chat_context_package.get("compressed_memory_text", "") if self.chat_context_package else "",
            "ingested_files": [
                {
                    "filename": f.filename,
                    "size": f.size_bytes,
                    "content_type": f.content_type,
                    "content": f.preview_or_content
                }
                for f in self.ingested_files
            ]
        }
        
        self._log_audit("CONTEXT_FETCHED", f"Context prepared for sub-agent step {step_id}")
        return context_packet

    def record_worker_output(self, step_id: str, result: WorkerResult):
        self.completed_outputs[step_id] = result
        if result.internal_handover:
            self.inter_agent_handovers[step_id] = result.internal_handover
        self._log_audit("WORKER_OUTPUT_RECORDED", f"Step {step_id} output saved", {
            "worker_model": result.worker_model,
            "domain": result.domain,
            "has_handover": bool(result.internal_handover),
            "execution_time_ms": result.execution_time_ms
        })

    def record_intermediate_review(self, step_id: str, review: IntermediateReviewResult):
        self.intermediate_reviews[step_id] = review
        self._log_audit("INTERMEDIATE_REVIEW_RECORDED", f"Step {step_id} reviewed with score {review.quality_score}", {
            "passed": review.passed,
            "status": review.status,
            "reviewer_model": review.reviewer_model
        })

    def append_negative_knowledge(self, item: NegativeKnowledgeItem):
        """
        Logs errors, edge cases, or review rejections to shared memory.
        Guarantees downstream agents receive active guidance to avoid repeating it.
        """
        self.negative_knowledge.append(item)
        self._log_audit("NEGATIVE_KNOWLEDGE_APPENDED", f"Logged issue in {item.stage}: {item.description}", {
            "mitigation": item.mitigation_applied,
            "directive": item.prevention_directive_for_downstream
        })

    def get_state(self) -> BlackboardState:
        return BlackboardState(
            session_id=self.session_id,
            original_prompt=self.original_prompt,
            structured_goal=self.structured_goal,
            global_prerequisites=self.global_prerequisites,
            completed_outputs=self.completed_outputs,
            inter_agent_handovers=self.inter_agent_handovers,
            intermediate_reviews=self.intermediate_reviews,
            negative_knowledge=self.negative_knowledge,
            current_step_id=self.current_step_id,
            audit_trail=self.audit_trail
        )
