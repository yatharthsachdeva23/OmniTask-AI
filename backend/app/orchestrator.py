import asyncio
import json
import uuid
from typing import AsyncGenerator, Dict, Any, List
from app.models.schemas import (
    TaskRequest,
    TaskStatus,
    BlackboardState,
    FinalEvaluationResult,
    DomainType,
)
from app.core.structurer import JSONStructurerAgent
from app.core.jev_router import JevFastRouter
from app.core.blackboard import CommonContextBlackboard
from app.workers.worker_pool import WorkerPool
from app.reviewers.review_engine import IntermediateReviewEngine
from app.core.evaluator import FinalEvaluationAgent
from app.core.dynamic_replanner import DynamicSwarmReplanner
from app.core.chat_manager import chat_manager
from app.core.context_rag import ChatContextRAG
from app.core.persistent_memory import persistent_memory

class OmniOrchestrator:
    """
    Main autonomous orchestrator for Track 2.
    Executes the entire multi-agent loop with streaming event telemetry.
    Supports in-flight dynamic sub-agent insertion and downstream context adaptation.
    """
    def __init__(self):
        self.structurer = JSONStructurerAgent()
        self.jev_router = JevFastRouter()
        self.worker_pool = WorkerPool()
        self.review_engine = IntermediateReviewEngine()
        self.evaluator = FinalEvaluationAgent()
        self.replanner = DynamicSwarmReplanner(max_dynamic_additions=2)

    async def execute_stream(self, request: TaskRequest) -> AsyncGenerator[str, None]:
        session_id = f"omni_{uuid.uuid4().hex[:8]}"

        # Initialize or retrieve multi-turn Chat Session
        chat_id = request.chat_id
        chat_session = None
        if chat_id:
            chat_session = chat_manager.get_chat(chat_id)

        if not chat_session:
            chat_session = chat_manager.create_chat(
                initial_prompt=request.prompt,
                delivery_mode=request.delivery_mode or "smart"
            )
            chat_id = chat_session.id

        # Record user message in the chat session
        user_msg = chat_manager.add_user_message(
            chat_id=chat_id,
            content=request.prompt,
            files=request.files,
            delivery_mode=request.delivery_mode or "smart",
            clarifications=request.user_clarifications,
            approved_plan_summary=request.approved_plan_summary
        )

        yield self._format_sse("CHAT_SESSION_ASSIGNED", {
            "chat_id": chat_id,
            "session_id": session_id,
            "title": chat_session.title,
            "user_message": user_msg.model_dump()
        })

        # User identity & Dedicated Cross-Chat Persistent Memory
        user_id = getattr(request, "user_id", "default_user") or "default_user"

        # When a new chat starts, initiate autonomous consolidation across past chats
        if len(chat_session.messages) <= 1:
            try:
                await persistent_memory.consolidate_from_all_chats(user_id=user_id)
            except Exception as mem_err:
                print(f"[Orchestrator] Persistent memory consolidation notice: {mem_err}")

        user_memory_block = persistent_memory.format_memory_for_prompt(user_id)
        if user_memory_block:
            yield self._format_sse("USER_GLOBAL_MEMORY_APPLIED", {
                "user_id": user_id,
                "has_memory": True,
                "message": "Loaded dedicated persistent memory: user profile & business context applied."
            })

        # Construct effective prompt including persistent memory, user-approved plan, clarifications, and prior turns
        effective_prompt = request.prompt
        clarifications_list = []
        if request.user_clarifications:
            for q, a in request.user_clarifications.items():
                if a and a.strip():
                    clarifications_list.append(f"{q}: {a.strip()}")
        
        if clarifications_list:
            effective_prompt += "\n\n[USER APPROVED CLARIFICATIONS & SPECIFICATIONS]:\n" + "\n".join([f"- {c}" for c in clarifications_list])

        if request.approved_plan_summary:
            effective_prompt += f"\n\n[USER APPROVED ARCHITECTURE PLAN]:\n{request.approved_plan_summary}"

        # Context Preservation & Chat Storage RAG across multi-turn chat sessions
        context_rag = ChatContextRAG(chat_session)
        context_package = context_rag.build_context_package(request.prompt)
        if context_package.get("has_prior_context"):
            effective_prompt = f"{context_package['formatted_context_block']}[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:\n{effective_prompt}"

        # Prepend dedicated Persistent Memory as the foundational first block
        if user_memory_block:
            effective_prompt = f"{user_memory_block}\n\n{effective_prompt}"

        # --- STEP 1: PARSING & STRUCTURING ---
        yield self._format_sse("STAGE_CHANGE", {
            "stage": "STRUCTURING",
            "message": "JSON Structurer Agent normalizing prompt, preferences, and ingested assets...",
            "session_id": session_id,
            "chat_id": chat_id
        })
        await asyncio.sleep(0.4)

        if context_package.get("rag_excerpts_text"):
            yield self._format_sse("CONTEXT_RAG_RETRIEVED", {
                "chat_id": chat_id,
                "message": "Retrieved verified excerpts from previous chat history via RAG to ground modifications."
            })

        if context_package.get("targeted_match_info"):
            t_match = context_package["targeted_match_info"]
            conf_pct = round(t_match["amplified_confidence"] * 100, 1)
            t_turn = t_match["matched_turn_index"]
            yield self._format_sse("TARGETED_DELIVERABLE_MATCHED", {
                "chat_id": chat_id,
                "matched_turn": t_turn,
                "is_immediate_preceding": t_match["is_immediate_preceding"],
                "amplified_confidence": conf_pct,
                "raw_confidence": round(t_match["raw_confidence"] * 100, 1),
                "message": f"Backward waterfall resolved target deliverable to Turn {t_turn} with {conf_pct}% amplified confidence."
            })

        if request.user_clarifications:
            yield self._format_sse("USER_PREFERENCES_APPLIED", {
                "clarifications": request.user_clarifications,
                "plan_summary": request.approved_plan_summary or ""
            })

        structured_goal = await self.structurer.structure_async(effective_prompt, request.files)
        
        # Intelligently update chat title with the clean extracted objective
        if structured_goal and structured_goal.primary_objective:
            clean_title = chat_manager.derive_title(request.prompt, structured_goal.primary_objective)
            chat_manager.update_chat_title(chat_id, clean_title)
            yield self._format_sse("CHAT_TITLE_UPDATED", {
                "chat_id": chat_id,
                "title": clean_title
            })

        yield self._format_sse("STRUCTURING_COMPLETED", {
            "structured_goal": structured_goal.model_dump(),
            "chat_id": chat_id
        })

        # --- STEP 2: JEV FAST SYSTEM 1 ROUTING ---
        yield self._format_sse("STAGE_CHANGE", {
            "stage": "JEV_ROUTING",
            "message": "Invoking Jev Fast System 1 Router for deterministic sub-task DAG classification...",
            "session_id": session_id,
            "chat_id": chat_id
        })
        await asyncio.sleep(0.3)

        routed_plan = await self.jev_router.route_plan_async(structured_goal)
        yield self._format_sse("JEV_ROUTING_COMPLETED", {
            "routed_plan": routed_plan.model_dump(),
            "latency_ms": routed_plan.jev_routing_latency_ms,
            "confidence": routed_plan.jev_confidence,
            "chat_id": chat_id
        })

        # --- STEP 3: INITIALIZE COMMON CONTEXT BLACKBOARD ---
        blackboard = CommonContextBlackboard(session_id, effective_prompt)
        if user_memory_block:
            blackboard.set_user_global_memory(user_memory_block)
        if context_package.get("has_prior_context"):
            blackboard.set_chat_context_package(context_package)
        if chat_session.blackboard_state:
            blackboard.load_prior_chat_state(chat_session.blackboard_state)
        blackboard.set_structured_goal(routed_plan, request.files)

        yield self._format_sse("BLACKBOARD_INITIALIZED", {
            "session_id": session_id,
            "prerequisites": blackboard.global_prerequisites,
            "tasks_count": len(routed_plan.sub_tasks)
        })

        # --- STEP 4: SUB-AGENT EXECUTION & ADAPTIVE STEP QA GATES ---
        task_queue: List[StructuredSubTask] = list(routed_plan.sub_tasks)
        task_index = 0
        dynamically_added_count = 0
        dynamically_inserted_tasks: List[StructuredSubTask] = []

        while task_index < len(task_queue):
            task = task_queue[task_index]
            step_id = task.step_id
            blackboard.current_step_id = step_id

            # Emit Sub-agent Start
            yield self._format_sse("SUBAGENT_STARTED", {
                "step_id": step_id,
                "title": task.title,
                "domain": task.domain,
                "assigned_worker": task.assigned_worker_model,
                "assigned_reviewer": task.assigned_reviewer_model,
                "status": TaskStatus.IN_PROGRESS,
                "is_dynamically_added": getattr(task, "is_dynamically_added", False),
                "dynamic_insertion_reason": getattr(task, "dynamic_insertion_reason", None)
            })

            # Fetch context from Blackboard (zero cold-start)
            context_packet = blackboard.get_context_for_subagent(step_id)

            # ADAPTIVE CONTINUITY DIRECTIVE FOR DOWNSTREAM AGENTS:
            # If dynamic specialist(s) were previously inserted and executed before this task,
            # inform this downstream agent of what was completed and how to adapt/integrate it!
            if dynamically_inserted_tasks and not getattr(task, "is_dynamically_added", False):
                continuity_directive = self.replanner.format_downstream_continuity_context(
                    dynamically_inserted_tasks,
                    blackboard.completed_outputs
                )
                if continuity_directive:
                    context_packet["downstream_continuity_directive"] = continuity_directive

            yield self._format_sse("CONTEXT_INJECTED", {
                "step_id": step_id,
                "prior_outputs_count": len(context_packet.get("cumulative_prior_outputs", {})),
                "avoidance_rules": context_packet.get("negative_knowledge_avoidance_rules", []),
                "has_continuity_adaptation": bool(context_packet.get("downstream_continuity_directive"))
            })

            await asyncio.sleep(0.6)

            # Worker executes
            worker_result = await self.worker_pool.execute_task(task, context_packet)
            yield self._format_sse("WORKER_COMPLETED", {
                "step_id": step_id,
                "worker_result": worker_result.model_dump()
            })

            # Intermediate Reviewer inspects output
            yield self._format_sse("INTERMEDIATE_REVIEW_STARTED", {
                "step_id": step_id,
                "reviewer_model": task.assigned_reviewer_model,
                "domain": task.domain
            })

            await asyncio.sleep(0.5)

            review_result, negative_knowledge = await self.review_engine.review_task(
                task,
                worker_result,
                primary_objective=blackboard.original_prompt,
                prior_outputs=context_packet.get("cumulative_prior_outputs", {}),
                cumulative_handovers=context_packet.get("cumulative_handovers", {})
            )

            # Autonomous Self-Correction Loop:
            # If reviewer marks score < 85% or passed is False, regenerate with new prompt from reviewer (max 5 times)
            attempt = 1
            max_attempts = 5
            task.retry_count = 0

            while (review_result.quality_score < 85 or not review_result.passed) and attempt < max_attempts:
                attempt += 1
                task.retry_count = attempt - 1
                critique_note = review_result.critique or "Quality score fell below required 85% threshold."
                
                # Sanitize diffusion prompts: NEVER pass technical review/accessibility rejection jargon into visual models
                is_visual_task = task.domain in [DomainType.VISION, DomainType.VIDEO] or "flux" in (task.assigned_worker_model or "").lower()
                if is_visual_task:
                    candidate = (review_result.reviewer_regenerate_prompt or "").strip()
                    has_error_jargon = any(err in candidate.lower() for err in ["rejection", "failed", "accessibility", "error", "critic", "penaliz", "status", "threshold", "corrupted"])
                    if candidate and not has_error_jargon:
                        regen_prompt = candidate
                    else:
                        regen_prompt = task.description
                else:
                    regen_prompt = review_result.reviewer_regenerate_prompt or f"{task.description}. Specifically rectify: {critique_note}"

                retry_avoidance = f"SELF-CORRECTION ATTEMPT {attempt}/{max_attempts}: Prior attempt scored {review_result.quality_score}%. Reviewer critique: {critique_note}. Regenerate strictly following: {regen_prompt}"
                if "negative_knowledge_avoidance_rules" not in context_packet:
                    context_packet["negative_knowledge_avoidance_rules"] = []
                context_packet["negative_knowledge_avoidance_rules"].append(retry_avoidance)

                if negative_knowledge:
                    blackboard.append_negative_knowledge(negative_knowledge)

                yield self._format_sse("STEP_RETRY_INITIATED", {
                    "step_id": step_id,
                    "title": task.title,
                    "attempt": attempt,
                    "max_attempts": max_attempts,
                    "quality_score": review_result.quality_score,
                    "rejection_critique": critique_note,
                    "reviewer_prompt": regen_prompt,
                    "action": f"Auto-correction {attempt}/{max_attempts}: Regenerating with Reviewer prompt..."
                })

                await asyncio.sleep(0.6)

                try:
                    # Re-execute worker using the new prompt from the reviewer
                    worker_result = await self.worker_pool.execute_task(
                        task,
                        context_packet,
                        override_prompt=regen_prompt,
                        attempt=attempt
                    )
                except Exception as w_err:
                    print(f"[Orchestrator] Worker error during retry {attempt} on {task.title}: {w_err}")
                
                yield self._format_sse("WORKER_COMPLETED", {
                    "step_id": step_id,
                    "worker_result": worker_result.model_dump(),
                    "is_retry": True,
                    "attempt": attempt
                })

                try:
                    # Re-review deliverable
                    review_result, negative_knowledge = await self.review_engine.review_task(
                        task,
                        worker_result,
                        primary_objective=blackboard.original_prompt,
                        prior_outputs=context_packet.get("cumulative_prior_outputs", {}),
                        cumulative_handovers=context_packet.get("cumulative_handovers", {})
                    )
                except Exception as r_err:
                    print(f"[Orchestrator] Review error during retry {attempt} on {task.title}: {r_err}")

            # If work is still not done (< 85%) after 5 tries, emit error message
            if review_result.quality_score < 85 or not review_result.passed:
                task.status = TaskStatus.FAILED
                error_msg = f"ERROR: Step '{task.title}' failed to achieve 85% quality score after {max_attempts} attempts. Final score: {review_result.quality_score}%. Critique: {review_result.critique}"
                yield self._format_sse("STEP_MAX_RETRIES_EXCEEDED", {
                    "step_id": step_id,
                    "title": task.title,
                    "attempts": max_attempts,
                    "final_score": review_result.quality_score,
                    "error_message": error_msg
                })
            else:
                task.status = TaskStatus.COMPLETED

            # Commit to Blackboard
            blackboard.record_worker_output(step_id, worker_result)
            blackboard.record_intermediate_review(step_id, review_result)

            if negative_knowledge:
                blackboard.append_negative_knowledge(negative_knowledge)

            yield self._format_sse("INTERMEDIATE_REVIEW_COMPLETED", {
                "step_id": step_id,
                "review_result": review_result.model_dump(),
                "negative_knowledge_logged": negative_knowledge.model_dump() if negative_knowledge else None,
                "blackboard_snapshot": blackboard.get_state().model_dump()
            })

            # --- DYNAMIC SWARM EXPANSION EVALUATION ---
            # Evaluate whether an additional specialist AI should be dynamically inserted
            new_specialist_task = self.replanner.evaluate_dynamic_expansion(
                current_task=task,
                worker_result=worker_result,
                review_result=review_result,
                primary_objective=blackboard.original_prompt,
                prior_outputs=blackboard.completed_outputs,
                remaining_tasks=task_queue[task_index + 1:],
                dynamically_added_count=dynamically_added_count
            )

            if new_specialist_task:
                dynamically_added_count += 1
                dynamically_inserted_tasks.append(new_specialist_task)
                
                # Insert immediately after current task (before downstream tasks)
                insert_pos = task_index + 1
                task_queue.insert(insert_pos, new_specialist_task)

                # Update downstream tasks' prerequisites so DAG is strictly sequential & coherent
                for downstream_task in task_queue[insert_pos + 1:]:
                    if new_specialist_task.step_id not in downstream_task.required_prerequisites:
                        downstream_task.required_prerequisites.append(new_specialist_task.step_id)

                # Update blackboard structured goal
                if blackboard.structured_goal:
                    blackboard.structured_goal.sub_tasks = list(task_queue)

                yield self._format_sse("DYNAMIC_SUBAGENT_INSERTED", {
                    "session_id": session_id,
                    "inserted_task": new_specialist_task.model_dump(),
                    "insert_after_step_id": step_id,
                    "reason": new_specialist_task.dynamic_insertion_reason,
                    "total_workflow_tasks": len(task_queue),
                    "updated_plan": {
                        "primary_objective": blackboard.original_prompt,
                        "sub_tasks": [t.model_dump() for t in task_queue]
                    }
                })

            await asyncio.sleep(0.3)
            task_index += 1

        # --- STEP 5: FINAL EVALUATION & COMPLETION SCORING ---
        yield self._format_sse("STAGE_CHANGE", {
            "stage": "FINAL_EVALUATION",
            "message": "Final Evaluation Agent computing task completion score & assembling deliverables...",
            "session_id": session_id
        })
        await asyncio.sleep(0.5)

        raw_mode = getattr(request, "delivery_mode", "smart") or "smart"
        delivery_mode = "strict" if str(raw_mode).lower() == "strict" else "smart"
        evaluation = self.evaluator.evaluate(blackboard.get_state(), delivery_mode=delivery_mode)

        # Persist session execution snapshot to disk for inspection & review
        try:
            from pathlib import Path
            sessions_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "sessions"
            sessions_dir.mkdir(parents=True, exist_ok=True)
            snapshot = {
                "session_id": session_id,
                "prompt": blackboard.original_prompt,
                "delivery_mode": delivery_mode,
                "final_evaluation": evaluation.model_dump(),
                "blackboard_state": blackboard.get_state().model_dump()
            }
            (sessions_dir / "latest_execution.json").write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
            (sessions_dir / f"{session_id}.json").write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
        except Exception as snap_err:
            print(f"[Orchestrator] Error saving session snapshot: {snap_err}")

        # Extract complete substantive deliverable text from blackboard completed outputs
        deliverable_texts = []
        for step_id, out in blackboard.completed_outputs.items():
            if out.output_text and out.output_text.strip():
                from app.utils.handover_extractor import sanitize_display_output
                clean_text = sanitize_display_output(out.output_text)
                if clean_text:
                    deliverable_texts.append(clean_text)

        full_content = "\n\n---\n\n".join(deliverable_texts) if deliverable_texts else (evaluation.summary_for_user or "Verified deliverables generated successfully.")

        # Auto-compile PDF deliverable if no PDF exists yet, so user has a clean PDF download option
        try:
            from app.utils.pdf_generator import markdown_to_pdf
            has_pdf = any(out.artifacts.get("pdf_url") for out in blackboard.completed_outputs.values())
            if not has_pdf and deliverable_texts and len(full_content) > 60:
                combined_md = "\n\n".join(deliverable_texts)
                clean_doc_title = (blackboard.structured_goal.primary_objective[:60] if blackboard.structured_goal else "Deliverables").strip()
                pdf_url, pdf_path = markdown_to_pdf(combined_md, title=clean_doc_title)
                last_step_id = list(blackboard.completed_outputs.keys())[-1]
                blackboard.completed_outputs[last_step_id].artifacts["pdf_url"] = pdf_url
                blackboard.completed_outputs[last_step_id].artifacts["filename"] = pdf_path.name
                blackboard.completed_outputs[last_step_id].artifacts["pdf_filename"] = pdf_path.name
                blackboard.completed_outputs[last_step_id].artifacts["has_pdf"] = True
                blackboard.completed_outputs[last_step_id].artifacts["file_size_bytes"] = pdf_path.stat().st_size
        except Exception as pdf_auto_err:
            print(f"[Orchestrator] Auto-PDF compilation notice: {pdf_auto_err}")

        # Assemble execution data snapshot for chat turn
        execution_data = {
            "session_id": session_id,
            "stage": "COMPLETED",
            "structured_goal": blackboard.structured_goal.model_dump() if blackboard.structured_goal else None,
            "final_evaluation": evaluation.model_dump(),
            "blackboard_state": blackboard.get_state().model_dump()
        }

        asst_msg = chat_manager.add_assistant_message(
            chat_id=chat_id,
            content=full_content,
            execution_data=execution_data,
            blackboard_state=blackboard.get_state().model_dump(),
            latest_evaluation=evaluation.model_dump()
        )

        # Incrementally update Persistent Memory if user disclosed persistent business/identity/rules
        try:
            updated_mem = persistent_memory.inspect_and_update_from_message(
                user_id=user_id,
                user_prompt=request.prompt,
                assistant_response=full_content,
                chat_id=chat_id
            )
            if updated_mem:
                yield self._format_sse("USER_GLOBAL_MEMORY_UPDATED", {
                    "user_id": user_id,
                    "message": "Persistent Memory self-updated: new durable facts preserved for future chats."
                })
        except Exception as mem_up_err:
            print(f"[Orchestrator] Incremental memory update notice: {mem_up_err}")

        yield self._format_sse("CHAT_MESSAGE_COMPLETED", {
            "chat_id": chat_id,
            "message": asst_msg.model_dump()
        })

        yield self._format_sse("EXECUTION_COMPLETED", {
            "session_id": session_id,
            "chat_id": chat_id,
            "final_evaluation": evaluation.model_dump(),
            "full_blackboard_state": blackboard.get_state().model_dump()
        })

    def _format_sse(self, event_name: str, data: Dict[str, Any]) -> str:
        payload = {
            "event": event_name,
            "data": data
        }
        return f"event: message\ndata: {json.dumps(payload)}\n\n"
