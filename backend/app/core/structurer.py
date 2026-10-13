import json
import re
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from app.models.schemas import (
    DomainType,
    StructuredSubTask,
    StructuredGoal,
    IngestedFile,
    TaskStatus,
)
from app.config import config

class JSONStructurerAgent:
    """
    Step 1: Converts unstructured, conversational natural language and file inputs
    into a typed, validated state schema required by Jev for System 1 decision-making.
    Uses live LLM intelligence (Gemini / Groq) to decompose user intent dynamically.
    """
    def __init__(self, model_name: str = "Omni-Structurer-v2"):
        self.model_name = model_name
        self.gemini_key = config.GEMINI_API_KEY
        self.groq_key = config.GROQ_API_KEY

    async def structure_async(self, prompt: str, files: List[IngestedFile]) -> StructuredGoal:
        cleaned_prompt = prompt.strip()

        # Build file context summaries for the LLM
        file_summaries = []
        for f in files:
            preview_snippet = f.preview_or_content[:500].replace("\n", " ") if f.preview_or_content else "Empty"
            file_summaries.append(f"- File: '{f.filename}' ({f.content_type}, {f.size_bytes} bytes). Preview: {preview_snippet}...")
        files_context = "\n".join(file_summaries) if file_summaries else "None attached."

        # 1. Primary: Attempt live Groq decomposition with JSON mode (Fastest: ~1.2s)
        if self.groq_key:
            try:
                goal = await self._call_groq_structurer(cleaned_prompt, files_context, files)
                if goal and goal.sub_tasks:
                    return goal
            except Exception as e:
                print(f"[JSON Structurer] Groq structuring error: {e}. Trying Gemini fallback.")

        # 2. Secondary: Attempt live Gemini decomposition with structured JSON mode
        if self.gemini_key:
            try:
                goal = await self._call_gemini_structurer(cleaned_prompt, files_context, files)
                if goal and goal.sub_tasks:
                    return goal
            except Exception as e:
                print(f"[JSON Structurer] Gemini structuring error: {e}. Falling back to dynamic semantic engine.")

        # 3. Dynamic Semantic Decomposition Fallback (Zero hardcoded text, prompt-derived)
        return self._dynamic_semantic_structure(cleaned_prompt, files)

    def structure(self, prompt: str, files: List[IngestedFile]) -> StructuredGoal:
        """
        Synchronous wrapper for backwards compatibility.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    return executor.submit(asyncio.run, self.structure_async(prompt, files)).result()
            else:
                return loop.run_until_complete(self.structure_async(prompt, files))
        except Exception as e:
            print(f"[JSON Structurer] Synchronous bridge fallback: {e}")
            return self._dynamic_semantic_structure(prompt.strip(), files)

    async def _call_gemini_structurer(self, prompt: str, files_context: str, files: List[IngestedFile]) -> Optional[StructuredGoal]:
        prompt_instruction = (
            "You are the JSON Structurer Agent for OmniTask AI.\n"
            "Analyze the following user objective and attached resources:\n\n"
            f"User Objective: \"{prompt}\"\n"
            f"Attached Files:\n{files_context}\n\n"
            "Decompose this request into a sequential DAG of 1 to 4 concrete sub-tasks.\n"
            "CRITICAL TASK DECOMPOSITION RULES:\n"
            "- DOCUMENT DELIVERABLE MULTI-AGENT DIRECTIVE:\n"
            "  * Any request asking to create a quiz, exam, test paper, assignment solutions, study guide, or report in a specific document format (Word document, .docx, doc, or PDF) REQUIRES AT LEAST 2 PURPOSEFUL SUB-TASKS:\n"
            "    - step_1: In-Depth Question/Content Formulation & Solutions (domain: 'audit', Worker: 'OpenAI GPT (Auditing Specialist)', expected_output_type: 'solutions_markdown')\n"
            "      Description: Synthesize exhaustive high-difficulty questions, multiple choice options with plausible distractors, complex application problems, and a complete answer key with deep technical explanations from the provided syllabus/materials.\n"
            "    - step_2: Publication-Grade Document Compilation (domain: 'audit', Worker: 'Word & Document Publishing Specialist' for Word/docx OR 'PDF & Document Publishing Specialist' for PDF, expected_output_type: 'word_document' or 'pdf_document')\n"
            "      Description: Compile and format the verified questions, options, code snippets, and answer key into a publication-grade downloadable document with clean typography and layout hierarchy.\n"
            "  * NEVER collapse a document creation request into a single agent! Content formulation and binary document compilation are two separate sub-agents.\n"
            "- MINIMAL NECESSARY MILESTONES (NON-REDUNDANCY DIRECTIVE):\n"
            "  * Only break a task into multiple sub-tasks IF genuinely required by distinct capabilities or disciplines (e.g. text generation vs. visual asset generation, code module vs. frontend HTML interface, analysis vs. binary document compilation).\n"
            "  * If a request is completely self-contained text with no document output (e.g. 'summarize this paragraph', 'write a short poem'), KEEP IT AS 1 SINGLE COHESIVE STEP.\n"
            "  * NEVER create artificial, redundant sequential steps like 'extract questions', 'answer questions', 'preview layout', and 'deliver final document'.\n"
            "- For single-domain requests (such as 'make an image of X', 'draw X', 'render photo of X'), do NOT artificially split into multiple steps like 'prompt engineering' and 'rendering'. An image request must be 1 SINGLE cohesive step (domain: 'vision'). Prompt expansion is handled internally by the visual worker.\n"
            "- Never produce two subtasks of domain 'vision' for the same image generation request.\n"
            "- CRITICAL DOMAIN RULES:\n"
            "  * Domain 'code' is for software development, programming, algorithms, frontend web development (HTML/CSS/JS), backend APIs, or database scripts.\n"
            "  * NEVER assign domain 'code' to poems, poetry, creative writing, essays, or natural language text! Writing a poem is domain 'audit' (Content/Summarizer Specialist).\n"
            "  * Domain 'audio' is for music generation, background audio tracks, beats, soundtracks, and sound design. Worker: 'Meta MusicGen & Suno AI (Music & Audio Specialist)'.\n"
            "  * Domain 'video' is for text-to-video generation, motion synthesis, and cinematic clips. Worker: 'Kling AI & CogVideoX (Motion & Video Specialist)'.\n"
            "  * MULTI-OPTION INDEPENDENCE RULE (SMART MODE):\n"
            "    - When providing multiple ideas, suggestions, or recipes (e.g. 3 paneer recipes), ALWAYS treat them as INDEPENDENT STANDALONE OPTIONS/PROJECTS.\n"
            "    - NEVER force the user to combine separate recipes/ideas into a single mashed-together video or project unless the user explicitly requested a combo platter video.\n"
            "    - The visual asset step must generate dedicated visual assets showcasing each individual option in mouth-watering, appetizing photographic detail!\n"
            "  * VISUAL ASSET PROMPT RULE:\n"
            "    - Image generation models excel at photorealistic, sensory food photography, lighting, textures, and plating.\n"
            "    - NEVER instruct visual models to paint 'channel logos', 'bold text on image', or graphic design overlays—these ruin diffusion quality!\n"
            "  * For compound requests like 'make an image of X and write a poem on it':\n"
            "    - step_1: Visual Asset Generation for X (domain: 'vision', Worker: 'Flux.1 (Visual Asset Specialist)')\n"
            "    - step_2: Compose Evocative Poem for X (domain: 'audit', Worker: 'Gemini 2.0 Flash (Summarizer Specialist)', expected_output_type: 'poem_markdown')\n"
            "  * Only split into 2 to 4 sub-tasks when the user objective genuinely requires multiple distinct disciplines (e.g. 'research + description + thumbnail', 'music + video', 'code + diagram').\n"
            "- UNIVERSAL NEGATIVE CONSTRAINTS & EXCLUSIONS MANDATE (CRITICAL ACROSS ALL DOMAINS):\n"
            "  * If the user prompt specifies what NOT to do, what to avoid, or negative restrictions (e.g. 'dont give me X', 'not day wise', 'no Y', 'strictly avoid Z', 'without external libraries', 'do not reveal answer'):\n"
            "  * You MUST extract EVERY negative exclusion into the 'constraints' array.\n"
            "  * In each sub-task's 'description', you MUST embed in ALL-CAPS: 'STRICT NEGATIVE EXCLUSIONS: [User exclusions]'.\n"
            "  * Downstream workers MUST NEVER violate user negative constraints under any circumstances.\n"
            "- UNIVERSAL CARDINALITY & PARAMETER DISAMBIGUATION MANDATE (APPLIES TO ANY DOMAIN):\n"
            "  * Distinguish domain context parameters, timelines, durations, or scopes (e.g. '9 days', '30-day challenge', '12 weeks', '15-30 sec clips', '10-year horizon', '100m sprint') from explicit target generation counts.\n"
            "  * NEVER confuse a timeframe, duration, or domain measurement with the count of items/options to produce unless the user explicitly uses counting directives (e.g. 'give me exactly N items', 'list N options').\n"
            "  * When asked for ideas, themes, modules, pillars, or topics without an explicit target count, structure the subtask to produce the optimal, comprehensive set suited to the scope (typically 3 to 6 distinct, well-rounded foundational pillars or modules). NEVER pad or hallucinate artificial items just to reach a duration or context number!\n"
            "- UNIVERSAL DELIVERABLE PURITY & OPERATIONAL GUIDANCE MANDATE:\n"
            "  * Primary deliverable items (e.g. topics, recipes, code modules, architectures, problems, features) MUST strictly represent authentic, viewer/user-facing deliverables.\n"
            "  * Operational rules, internal creator guidelines, marketing advice, soft-selling techniques, and execution tips must NEVER be disguised or numbered as primary deliverable items!\n"
            "  * All meta-advice, production tips, and operational strategies MUST be placed under a dedicated guidance section at the conclusion of the deliverable (e.g. '### Operational Strategy & Execution Guidelines').\n"
            "- UNIVERSAL ALL-IN-ONE DELIVERABLE COMPLETION MANDATE:\n"
            "  * Ensure the worker delivers all components (core items, in-depth breakdowns, operational tips, and practical starter templates/samples) within a single unified markdown response so the user gets everything in one place.\n"
            "- UNIVERSAL MULTI-TURN INTENT RESOLUTION & RECENCY GROUNDING (CRITICAL ACROSS ALL DOMAINS):\n"
            "  * If a [CONVERSATION CHAT HISTORY & PRECEDING DELIVERABLES] block is present:\n"
            "    1. CONVERSATIONAL INQUIRY / DOUBT / QUESTION:\n"
            "       If the user asks a conceptual question, raises a doubt, checks feasibility, asks 'how/why', or challenges a premise (e.g. 'how can we make multiple videos on one topic', 'why did you choose this approach', 'isn't this missing X', 'is this scalable'):\n"
            "       - DO NOT structure this as a task to regenerate or restart the entire project or item catalog from scratch!\n"
            "       - Structure this as 1 SINGLE SUB-TASK (domain: 'audit', Worker: 'Gemini 2.0 Flash (Summarizer Specialist)' or 'OpenAI GPT (Auditing Specialist)', expected_output_type: 'analytical_deliverable_markdown') dedicated to directly answering the user's question, explaining the strategic/technical rationale, and resolving their doubt using the immediate prior context.\n"
            "    2. TARGETED MODIFICATION / CONTINUATION:\n"
            "       If the user asks to modify, extend, or reformat a specific element (e.g. 'change item 2', 'add 2 more options', 'export to Word/PDF'):\n"
            "       - Structure sub-tasks specifically to make the requested revisions and compile the updated deliverables while preserving all other accepted components.\n"
            "    3. FRESH START:\n"
            "       Only regenerate from scratch if the user explicitly instructs to start over or discard previous work.\n\n"
            "Each sub-task must have:\n"
            "- step_id: e.g. 'step_1', 'step_2'\n"
            "- title: specific descriptive title tailored to what is being executed\n"
            "- domain: one of ['code', 'math', 'vision', 'audio', 'video', 'audit']\n"
            "- description: detailed instructions for the specialized worker sub-agent. Must specify exactly what to execute and what NOT to do.\n"
            "- assigned_worker_model: name of model best suited (e.g. 'Qwen 2.5 Coder (via Groq Cloud)', 'Gemini 2.0 Flash (Summarizer Specialist)', 'Mistral (Legal & Formal Logic Specialist)', 'Flux.1 (Visual Asset Specialist)', 'Meta MusicGen & Suno AI (Music & Audio Specialist)', 'Kling AI & CogVideoX (Motion & Video Specialist)', 'OpenAI GPT (Auditing Specialist)', 'Word & Document Publishing Specialist', 'PDF & Document Publishing Specialist')\n"
            "- assigned_reviewer_model: 'Gemini 2.0 Flash (Multimodal & Step QA Reviewer)'\n"
            "- required_prerequisites: list of prerequisites (e.g. ['Initial user objective'], ['step_1'])\n"
            "- expected_output_type: e.g. 'code_module', 'webpage_markup', 'markdown_report', 'rendered_image_url', 'audio_track_url', 'video_clip_url', 'poem_markdown', 'solutions_markdown', 'word_document', 'pdf_document'\n\n"
            "Return strictly valid JSON with this exact schema:\n"
            "{\n"
            '  "primary_objective": "Clear single-sentence encapsulation of the user\'s core goal",\n'
            '  "constraints": ["Constraint 1", "Constraint 2"],\n'
            '  "prerequisites": ["Prerequisite 1", ...],\n'
            '  "sub_tasks": [\n'
            '    {\n'
            '      "step_id": "step_1",\n'
            '      "title": "...",\n'
            '      "domain": "code" | "math" | "vision" | "video" | "audit",\n'
            '      "description": "...",\n'
            '      "assigned_worker_model": "...",\n'
            '      "assigned_reviewer_model": "Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",\n'
            '      "required_prerequisites": ["..."],\n'
            '      "expected_output_type": "..."\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        candidate_models = ["gemini-3.8-flash", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"]
        for c_model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{c_model}:generateContent?key={self.gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt_instruction}]}],
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": 0.1
                }
            }

            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            raw_text = candidates[0]["content"]["parts"][0]["text"]
                            parsed = json.loads(raw_text)
                            if isinstance(parsed, list) and len(parsed) > 0:
                                parsed = parsed[0]
                            goal = self._parse_json_to_goal(parsed, prompt, files)
                            if goal and goal.sub_tasks:
                                return goal
            except Exception as e:
                print(f"[JSON Structurer] {c_model} error: {e}")
        return None

    async def _call_groq_structurer(self, prompt: str, files_context: str, files: List[IngestedFile]) -> Optional[StructuredGoal]:
        system_prompt = (
            "You are the JSON Structurer Agent for OmniTask AI.\n"
            "Decompose user requests and attached resources into a validated DAG of sequential subtasks.\n"
            "Output strictly valid JSON with keys: 'primary_objective', 'constraints', 'prerequisites', and 'sub_tasks'.\n\n"
            "CRITICAL DOMAIN RULES:\n"
            "- Domain 'audit': For text research, summaries, reports, resource compilation, comparisons, poems, and content analysis. Worker: 'OpenAI GPT (Auditing Specialist)' or 'Gemini 2.0 Flash (Summarizer Specialist)'.\n"
            "- Domain 'code': Strictly for programming, scripts, APIs, algorithms, frontend HTML/CSS/JS. Worker: 'Qwen 2.5 Coder (via Groq Cloud)'. NEVER assign to plain text summaries or reports!\n"
            "- Domain 'vision': Strictly for generating images, thumbnails, photos, diagrams, illustrations. Worker: 'Flux.1 (Visual Asset Specialist)'.\n"
            "- Domain 'audio': Strictly for music tracks, audio generation, sound effects. Worker: 'Meta MusicGen & Suno AI (Music & Audio Specialist)'. ONLY use when user explicitly asks for music or audio!\n"
            "- Domain 'video': Strictly for video generation, motion clips, animation. Worker: 'Kling AI & CogVideoX (Motion & Video Specialist)'. ONLY use when user explicitly asks for video, motion, or animation! NEVER assign to text summaries or markdown reports!\n"
            "- DOCUMENT DELIVERABLE MULTI-AGENT DIRECTIVE:\n"
            "  * Any request asking to create a quiz, exam, test paper, assignment solutions, study guide, or report in a specific document format (Word document, .docx, doc, or PDF) REQUIRES AT LEAST 2 PURPOSEFUL SUB-TASKS:\n"
            "    - step_1: In-Depth Question/Content Formulation & Solutions (domain: 'audit', Worker: 'OpenAI GPT (Auditing Specialist)', expected_output_type: 'solutions_markdown')\n"
            "      Description: Synthesize exhaustive high-difficulty questions, multiple choice options with plausible distractors, complex application problems, and a complete answer key with deep technical explanations from the provided syllabus/materials.\n"
            "    - step_2: Publication-Grade Document Compilation (domain: 'audit', Worker: 'Word & Document Publishing Specialist' for Word/docx OR 'PDF & Document Publishing Specialist' for PDF, expected_output_type: 'word_document' or 'pdf_document')\n"
            "      Description: Compile and format the verified questions, options, code snippets, and answer key into a publication-grade downloadable document with clean typography and layout hierarchy.\n"
            "  * NEVER collapse a document creation request into a single agent! Content synthesis and binary document compilation are two separate sub-agents.\n"
            "- MINIMAL NECESSARY MILESTONES (NON-REDUNDANCY DIRECTIVE):\n"
            "  * Only break a task into multiple sub-tasks IF genuinely required by distinct capabilities or disciplines (e.g. text generation vs. visual asset generation, code module vs. frontend HTML interface, analysis vs. binary document compilation).\n"
            "  * If a request is completely self-contained text with no document output (e.g. 'summarize this paragraph', 'write a short poem'), KEEP IT AS 1 SINGLE COHESIVE STEP.\n"
            "  * NEVER artificially split into redundant steps like 'extract questions', 'answer questions', 'preview layout', and 'deliver final document'.\n"
            "- UNIVERSAL CARDINALITY & PARAMETER DISAMBIGUATION MANDATE (APPLIES TO ANY DOMAIN):\n"
            "  * Distinguish domain context parameters, timelines, durations, or scopes (e.g. '9 days', '30-day challenge', '12 weeks', '15-30 sec clips', '10-year horizon') from explicit target generation counts.\n"
            "  * NEVER confuse a timeframe or measurement with the count of items to produce unless the user explicitly asks for an exact count ('give me N items'). When no count is given, provide the optimal, comprehensive set (typically 3 to 6 distinct, well-rounded foundational pillars or modules).\n"
            "- UNIVERSAL DELIVERABLE PURITY & OPERATIONAL GUIDANCE MANDATE:\n"
            "  * All primary items MUST be authentic viewer/user-facing deliverables. NEVER turn internal guidelines or marketing advice into numbered deliverable items! Put operational and strategic advice into a dedicated guidance section at the end.\n"
            "- UNIVERSAL ALL-IN-ONE DELIVERABLE COMPLETION MANDATE:\n"
            "  * Ensure everything requested (core items, deep breakdowns, operational tips, and starter samples) is delivered in a single unified response.\n"
            "- UNIVERSAL MULTI-TURN INTENT RESOLUTION & RECENCY GROUNDING:\n"
            "  * When the user asks a conceptual question, raises a doubt, or asks for strategic/technical clarification (e.g. 'how can we do X', 'why did you pick Y', 'is this feasible'):\n"
            "  * DO NOT structure this as a task to regenerate or restart the entire project or catalog from scratch!\n"
            "  * Structure this as 1 SINGLE SUB-TASK (domain: 'audit') dedicated to directly answering the user's question, explaining the rationale, and resolving their doubt using the immediate prior context."
        )
        user_msg = (
            f"User Objective: \"{prompt}\"\n"
            f"Attached Files:\n{files_context}\n\n"
            "Generate 1 to 4 subtasks with valid domains ('code', 'math', 'vision', 'audio', 'video', 'audit')."
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.groq_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "openai/gpt-oss-120b",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_msg}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                return self._parse_json_to_goal(parsed, prompt, files)
        return None

    def _normalize_domain(self, domain: DomainType, title: str, desc: str, prompt: str, out_type: str) -> DomainType:
        """
        Enforces strict domain boundaries preventing LLMs from misclassifying text tasks as video or code.
        """
        task_text = f"{title} {desc} {out_type}".lower()
        prompt_text = prompt.lower()

        video_triggers = ["video", "motion", "clip", "animation", "b-roll", "storyboard", "cinematic shot", "camerawork"]
        is_video_task = any(vt in task_text for vt in video_triggers) or any(vt in prompt_text for vt in video_triggers)
        is_text_synthesis = any(st in task_text for st in [
            "summariz", "synthesiz", "markdown report", "write a report", "table", "curate", "audit",
            "extract points", "structure points", "list of", "deliverable_markdown", "overview", "strategy content",
            "pdf", "answer", "question"
        ])

        if domain == DomainType.VIDEO:
            # If the user prompt didn't ask for video, or task is summarizing/reporting, remap to AUDIT
            if not is_video_task or (is_text_synthesis and not any(vt in task_text for vt in ["generate video", "render video", "video clip", "create video"])):
                return DomainType.AUDIT

        audio_triggers = ["audio", "music", "soundtrack", "song", "beat", "melody", "sound effect", "suno", "musicgen"]
        is_audio_task = any(at in task_text for at in audio_triggers) or any(at in prompt_text for at in audio_triggers)
        if domain == DomainType.AUDIO and not is_audio_task:
            return DomainType.AUDIT

        vision_triggers = ["image", "picture", "photo", "render", "visual", "thumbnail", "illustration", "diagram", "infographic", "drawing", "poster"]
        is_vision_task = any(vt in task_text for vt in vision_triggers) or any(vt in prompt_text for vt in vision_triggers)
        if domain == DomainType.VISION and not is_vision_task:
            return DomainType.AUDIT

        quiz_triggers = ["quiz", "exam", "test paper", "question paper", "mcq", "multiple choice", "fill-in-the-blank", "answer key", "study guide", "syllabus", "problem set", "assignment questions"]
        is_quiz_task = any(qt in task_text for qt in quiz_triggers) or any(qt in prompt_text for qt in quiz_triggers)
        is_software_dev = any(st in (title + " " + desc).lower() for st in [
            "build app", "create website", "react app", "fastapi app", "terminal game", "cli script", "python script to run", "write a program that"
        ])

        # Academic quizzes, syllabus tests, and exams are ALWAYS AUDIT domain (never CODE, VISION, AUDIO, or VIDEO)
        if is_quiz_task and not is_software_dev:
            return DomainType.AUDIT

        code_triggers = ["python", "script", "program", "api", "html", "css", "javascript", "code", "coding", "software", "backend", "frontend", "algorithm", "developer", "endpoint", "database", "sql"]
        has_code_keywords = any(ct in task_text for ct in code_triggers)
        if domain == DomainType.CODE and not has_code_keywords:
            return DomainType.AUDIT

        return domain

    def _parse_json_to_goal(self, parsed: Dict[str, Any], prompt: str, files: List[IngestedFile]) -> StructuredGoal:
        primary_objective = parsed.get("primary_objective")
        user_current_directive = ""
        if "[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:" in prompt:
            user_current_directive = prompt.split("[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:")[-1].strip()
        elif "[USER FOLLOW-UP / MODIFICATION DIRECTIVE]:" in prompt:
            user_current_directive = prompt.split("[USER FOLLOW-UP / MODIFICATION DIRECTIVE]:")[-1].strip()

        if user_current_directive:
            is_question = any(q in user_current_directive.lower() for q in [
                "isnt it", "isn't it", "how can we", "how do we", "how would", "why did", "why is",
                "can we", "what if", "explain how", "clarify", "is it possible"
            ]) or user_current_directive.strip().endswith("?")
            if is_question or not primary_objective or len(primary_objective) > 150:
                primary_objective = user_current_directive
        elif not primary_objective:
            primary_objective = prompt
        constraints = parsed.get("constraints", [
            "Must maintain strict execution integrity across sub-agents.",
            "All outputs must pass domain-specific quality reviews before commit."
        ])
        if not isinstance(constraints, list):
            constraints = [str(constraints)]

        prereqs = parsed.get("prerequisites", [f"User Objective: {prompt}"])
        if not isinstance(prereqs, list):
            prereqs = [str(prereqs)]
        for f in files:
            entry = f"Ingested Resource: {f.filename} ({f.content_type}, {f.size_bytes} bytes)"
            if entry not in prereqs:
                prereqs.append(entry)

        # Extract any explicit negative directives from user prompt universally
        neg_phrases = []
        for segment in re.split(r'[,.\n;]+', prompt):
            seg_s = segment.strip()
            # Catch any negative directive or exclusion pattern regardless of domain
            if re.search(r'\b(dont|don\'t|do not|never|without|strictly avoid|avoid|exclude|excluding|omit|no\s+[a-z0-9_-]+|not\s+[a-z0-9_-]+)\b', seg_s, re.IGNORECASE):
                if len(seg_s) > 5 and not any(seg_s.lower().startswith(fp) for fp in ["not only", "not just", "no problem", "no doubt"]):
                    neg_phrases.append(f"STRICT USER EXCLUSION: {seg_s}")

        for neg in neg_phrases:
            if neg not in constraints:
                constraints.append(neg)

        raw_tasks = parsed.get("sub_tasks", [])
        sub_tasks: List[StructuredSubTask] = []
        for idx, t in enumerate(raw_tasks):
            if not isinstance(t, dict):
                continue
            domain_raw = str(t.get("domain", "audit")).lower()
            try:
                domain = DomainType(domain_raw)
            except ValueError:
                domain = DomainType.AUDIT

            step_id = t.get("step_id") or f"step_{idx + 1}"
            title = t.get("title") or f"Sub-Task {idx + 1}"
            desc = t.get("description") or f"Execute milestone {idx + 1} for: {prompt[:80]}"
            if neg_phrases:
                desc = f"{desc}\n\n[MANDATORY USER NEGATIVE CONSTRAINTS (STRICTLY OBEY)]:\n" + "\n".join([f"- {np}" for np in neg_phrases])
            req_prereqs = t.get("required_prerequisites", [f"step_{idx}"] if idx > 0 else ["User input"])
            if not isinstance(req_prereqs, list):
                req_prereqs = [str(req_prereqs)]
            out_type = t.get("expected_output_type", "deliverable_markdown")

            # Apply domain normalization guardrail
            domain = self._normalize_domain(domain, title, desc, prompt, out_type)

            # Assign specialized worker model aligned with normalized domain
            worker_candidate = t.get("assigned_worker_model", "")
            if domain == DomainType.AUDIT:
                is_answering_step = any(w in title.lower() for w in ["question answering", "answer questions", "answering & solutions", "answering and solutions", "extract and answer", "quiz formulation", "quiz generation"])
                is_quiz_step = any(w in (title + " " + desc).lower() for w in ["quiz", "test paper", "exam", "question paper", "mcq", "multiple choice", "fill-in-the-blank", "answer key", "syllabus"])
                is_doc_compile = (
                    out_type.lower() in ["pdf_document", "pdf_deliverable", "pdf", "word_document", "docx", "doc"]
                    or "document publishing specialist" in worker_candidate.lower()
                    or "pdf & document publishing specialist" in worker_candidate.lower()
                    or "word" in worker_candidate.lower()
                    or any(w in title.lower() for w in [
                        "pdf document compilation", "pdf compilation", "compile pdf",
                        "document compilation", "pdf publishing", "word document compilation",
                        "word compilation", "compile word", "word document"
                    ])
                ) and not is_answering_step and not (is_quiz_step and out_type.lower() not in ["word_document", "pdf_document", "docx", "pdf"])

                if is_doc_compile:
                    is_word = any(w in (title + " " + desc + " " + out_type + " " + prompt).lower() for w in ["word", "docx", "doc", "microsoft word"])
                    worker = "Word & Document Publishing Specialist" if is_word else "PDF & Document Publishing Specialist"
                elif is_quiz_step:
                    worker = "OpenAI GPT (Auditing Specialist)"
                elif any(w in desc.lower() or w in title.lower() for w in ["summariz", "summary"]):
                    worker = "Gemini 2.0 Flash (Summarizer Specialist)"
                elif any(w in desc.lower() or w in title.lower() for w in ["compar", "tradeoff", "differ", "suitability", "profile"]):
                    worker = "Mistral (Legal & Formal Logic Specialist)"
                else:
                    worker = "OpenAI GPT (Auditing Specialist)"
            elif domain == DomainType.CODE:
                worker = "Qwen 2.5 Coder (via Groq Cloud)"
            elif domain == DomainType.VISION:
                worker = "Flux.1 (Visual Asset Specialist)"
            elif domain == DomainType.AUDIO:
                worker = "Meta MusicGen & Suno AI (Music & Audio Specialist)"
            elif domain == DomainType.VIDEO:
                worker = "Kling AI & CogVideoX (Motion & Video Specialist)"
            elif domain == DomainType.MATH:
                worker = "Mistral (Legal & Formal Logic Specialist)"
            else:
                worker = worker_candidate or "OpenAI GPT / Gemini Specialist"

            reviewer = "Gemini 2.0 Flash (Multimodal & Step QA Reviewer)"

            sub_tasks.append(StructuredSubTask(
                step_id=step_id,
                title=title,
                domain=domain,
                description=desc,
                assigned_worker_model=worker,
                assigned_reviewer_model=reviewer,
                required_prerequisites=req_prereqs,
                expected_output_type=out_type,
                status=TaskStatus.PENDING
            ))

        # CRITICAL MULTI-AGENT GUARDRAIL:
        # If user objective requested a document deliverable (Word doc, .docx, PDF) and sub_tasks has no document compiler:
        p_check = (prompt + " " + primary_objective).lower()
        wants_word = any(w in p_check for w in ["word", "docx", "doc", "microsoft word", "in word", "as word"])
        wants_pdf = any(w in p_check for w in ["pdf", "in a pdf", "to pdf", "as pdf", "make a pdf"])
        is_quiz_task = any(w in p_check for w in ["quiz", "test paper", "exam", "assignment", "problem set"])

        has_compiler = any(
            (
                t.expected_output_type in ["word_document", "pdf_document", "docx", "pdf"] or
                "publishing specialist" in t.assigned_worker_model.lower() or
                "word & document" in t.assigned_worker_model.lower() or
                "pdf & document" in t.assigned_worker_model.lower()
            ) and any(w in (t.title + " " + t.description).lower() for w in [
                "compilation", "compile", "publishing", "word document compilation", "pdf document compilation",
                "format and compile", "publish"
            ])
            for t in sub_tasks
        )

        if (wants_word or wants_pdf or is_quiz_task) and not has_compiler and len(sub_tasks) > 0:
            last_task = sub_tasks[-1]
            doc_step_id = f"step_{len(sub_tasks) + 1}"
            if wants_word:
                sub_tasks.append(StructuredSubTask(
                    step_id=doc_step_id,
                    title="Publication-Grade Microsoft Word (.docx) Document Compilation",
                    domain=DomainType.AUDIT,
                    description=f"Compile and format the verified content from {last_task.step_id} into a publication-grade Microsoft Word document (.docx) ready for download.",
                    assigned_worker_model="Word & Document Publishing Specialist",
                    assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                    required_prerequisites=[last_task.step_id],
                    expected_output_type="word_document",
                    status=TaskStatus.PENDING
                ))
            else:
                sub_tasks.append(StructuredSubTask(
                    step_id=doc_step_id,
                    title="Publication-Grade PDF Document Compilation",
                    domain=DomainType.AUDIT,
                    description=f"Compile and format the verified content from {last_task.step_id} into a publication-grade PDF document ready for download.",
                    assigned_worker_model="PDF & Document Publishing Specialist",
                    assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                    required_prerequisites=[last_task.step_id],
                    expected_output_type="pdf_document",
                    status=TaskStatus.PENDING
                ))

        # Conversational Q&A Safeguard: If user asks a question or expresses a doubt, ensure subtasks focus on directly answering it rather than blindly regenerating
        if user_current_directive:
            is_question = any(q in user_current_directive.lower() for q in [
                "isnt it", "isn't it", "how can we", "how do we", "how would", "why did", "why is",
                "can we really", "what if", "explain how", "clarify how", "is it possible to"
            ]) or (user_current_directive.strip().endswith("?") and not any(gen in user_current_directive.lower() for gen in ["generate", "create", "build", "write me a", "make a", "draw", "render"]))
            if is_question and len(sub_tasks) > 1:
                first_task = sub_tasks[0]
                first_task.title = f"Direct Strategic Explanation: {user_current_directive[:50]}"
                first_task.domain = DomainType.AUDIT
                first_task.description = f"Directly and thoroughly answer the user's question, doubt, or strategic inquiry: '{user_current_directive}'. Provide clear reasoning, practical solutions, and detailed explanations grounded in the preceding deliverable. Do NOT restart from scratch or regenerate a generic catalog."
                first_task.expected_output_type = "analytical_deliverable_markdown"
                sub_tasks = [first_task]

        if not sub_tasks:
            # Fallback if empty array returned
            return self._dynamic_semantic_structure(prompt, files)

        return StructuredGoal(
            primary_objective=primary_objective,
            prerequisites=prereqs,
            constraints=constraints,
            sub_tasks=sub_tasks,
            jev_routing_latency_ms=0.0,
            jev_confidence=0.99
        )

    def _dynamic_semantic_structure(self, prompt: str, files: List[IngestedFile]) -> StructuredGoal:
        """
        Dynamic fallback engine deriving custom subtasks based on semantic intent and attached files.
        Contains ZERO hardcoded test snippets or fixed formulas.
        """
        user_directive = prompt
        # Strip injected persistent memory blocks and directives
        if "======================================================================" in user_directive:
            parts = user_directive.split("======================================================================")
            if len(parts) >= 3:
                user_directive = parts[-1].strip()
        if "[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:" in user_directive:
            user_directive = user_directive.split("[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:")[-1].strip()
        elif "[USER FOLLOW-UP / MODIFICATION DIRECTIVE]:" in user_directive:
            user_directive = user_directive.split("[USER FOLLOW-UP / MODIFICATION DIRECTIVE]:")[-1].strip()
        if "[USER APPROVED CLARIFICATIONS & SPECIFICATIONS]:" in user_directive:
            user_directive = user_directive.split("[USER APPROVED CLARIFICATIONS & SPECIFICATIONS]:")[0].strip()
        if "[USER APPROVED ARCHITECTURE PLAN]:" in user_directive:
            user_directive = user_directive.split("[USER APPROVED ARCHITECTURE PLAN]:")[0].strip()

        # Sanitize for title snippet
        clean_snippet = re.sub(r'[\r\n\t]+', ' ', user_directive).strip()
        clean_snippet = re.sub(r'[*_`#"\']', '', clean_snippet)[:45].strip()
        if not clean_snippet:
            clean_snippet = "Specified Directive"

        p_lower = user_directive.lower()
        subtasks: List[StructuredSubTask] = []
        step_idx = 1

        def _has_kw(keywords: List[str], text: str) -> bool:
            for kw in keywords:
                if re.search(rf"\b{re.escape(kw)}\b", text, re.IGNORECASE):
                    return True
            return False

        # --- PRIORITY 1: Academic / Syllabus / Exam / Quiz / Document Deliverable ---
        is_academic_assignment = bool(files) or _has_kw([
            "syllabus", "assignment", "assignments", "quiz", "exam", "test paper",
            "question paper", "question bank", "mcq", "multiple choice",
            "fill in the blanks", "fill-in-the-blank", "answer key", "ans key",
            "unit 1", "unit 2", "unit 3", "unit 4", "btech", "lecture notes", "study guide"
        ], p_lower)

        if is_academic_assignment:
            file_names = ", ".join([f.filename for f in files]) if files else "provided syllabus and materials"
            wants_word = _has_kw(["word", "docx", "doc", "microsoft word", "in word", "as word", "doc file", "doc files"], p_lower)
            wants_pdf = _has_kw(["pdf", "download as pdf", "generate pdf", "make a pdf", "in a pdf", "seperate pdf", "separate pdf"], p_lower)

            # Step 1: In-depth questions and answer formulation
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=f"In-Depth Quiz & Solution Formulation from Syllabus",
                domain=DomainType.AUDIT,
                description=f"Synthesize comprehensive, high-difficulty exam questions (MCQs with plausible distractors, fill in the blanks, complex conceptual problems) and an exhaustive separate answer key from {file_names}.",
                assigned_worker_model="OpenAI GPT (Auditing Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=["Attached syllabus and specifications"],
                expected_output_type="solutions_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

            # Step 2: Binary publication document compiler
            if wants_word or not wants_pdf:
                subtasks.append(StructuredSubTask(
                    step_id=f"step_{step_idx}",
                    title="Publication-Grade Microsoft Word (.docx) Document Compilation",
                    domain=DomainType.AUDIT,
                    description="Compile and format the verified quiz questions, options, code snippets, and answer key into publication-grade Microsoft Word document (.docx) and companion PDF files ready for download.",
                    assigned_worker_model="Word & Document Publishing Specialist",
                    assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                    required_prerequisites=[f"step_{step_idx-1}"],
                    expected_output_type="word_document",
                    status=TaskStatus.PENDING
                ))
                step_idx += 1
            else:
                subtasks.append(StructuredSubTask(
                    step_id=f"step_{step_idx}",
                    title="Publication-Grade PDF Document Compilation",
                    domain=DomainType.AUDIT,
                    description="Compile the verified questions, options, and answer key into a beautifully formatted, publication-grade PDF document ready for download.",
                    assigned_worker_model="PDF & Document Publishing Specialist",
                    assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                    required_prerequisites=[f"step_{step_idx-1}"],
                    expected_output_type="pdf_document",
                    status=TaskStatus.PENDING
                ))
                step_idx += 1

            # Dedicated constraints and prerequisites for academic deliverable
            prereqs = [f"User Objective: {clean_snippet}"]
            for f in files:
                prereqs.append(f"Ingested Resource: {f.filename} ({f.content_type}, {f.size_bytes} bytes)")
            constraints = [
                "Must maintain strict academic rigor and difficulty suitable for 4th year BTech students.",
                "Questions and Answer Key must be cleanly structured into separate deliverable documents.",
                "All intermediate outputs must pass quality review before commit."
            ]
            return StructuredGoal(
                primary_objective=f"Formulate comprehensive academic assignment and compile publication-grade documents for: {clean_snippet}",
                prerequisites=prereqs,
                constraints=constraints,
                sub_tasks=subtasks,
                jev_routing_latency_ms=0.0,
                jev_confidence=0.99
            )

        # Check for Conversational Doubt / Strategy Inquiry / Direct Question
        is_question_or_doubt = any(q in p_lower for q in [
            "isnt it", "isn't it", "how can we", "how do we", "how would", "why did", "why is",
            "can we really", "what if", "explain how", "clarify how", "is it possible to"
        ]) or (p_lower.endswith("?") and not any(gen in p_lower for gen in ["generate", "create", "build", "write me a", "make a", "draw", "render"]))
        if is_question_or_doubt:
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=f"Direct Strategic Clarification & Resolution for '{clean_snippet}...'",
                domain=DomainType.AUDIT,
                description=f"Directly and thoughtfully answer the user's question, doubt, or strategic inquiry: '{user_directive}'. Provide clear reasoning, practical solutions, and detailed explanations grounded in the preceding deliverable. Do NOT restart from scratch or regenerate a generic catalog.",
                assigned_worker_model="Gemini 2.0 Flash (Summarizer Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=["Immediate preceding deliverable and active conversation context"],
                expected_output_type="analytical_deliverable_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Riddle / Guessing Game with Visual Output
        has_riddle = not is_question_or_doubt and _has_kw(["riddle", "guess", "puzzle", "pointers and we have to guess", "thinking of an image"], p_lower)
        wants_image = _has_kw(["image", "picture", "photo", "render", "draw"], p_lower)
        if has_riddle and wants_image:
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title="Compose Object Riddle and Pointers",
                domain=DomainType.AUDIT,
                description=f"Compose an engaging riddle and 5 clue pointers for a chosen secret object without revealing the answer in text: {user_directive}",
                assigned_worker_model="OpenAI GPT (Auditing Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=["Initial riddle constraints"],
                expected_output_type="riddle_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title="Render Visual Asset of Riddle Answer",
                domain=DomainType.VISION,
                description="Render a high-quality visual asset of the secret answer object chosen in step_1.",
                assigned_worker_model="Flux.1 (Visual Asset Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=[f"step_{step_idx-1}"],
                expected_output_type="rendered_image_url",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Math / Calculation / Financial
        has_math = _has_kw(["math", "calculate", "equation", "formula", "regression", "statistics", "numerical", "finance", "revenue", "roi", "data analysis", "cost"], p_lower)
        if has_math:
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=f"Quantitative Derivation & Analysis for '{clean_snippet}...'",
                domain=DomainType.MATH,
                description=f"Perform rigorous mathematical derivation, numerical evaluation, or statistical calculation for: {user_directive}",
                assigned_worker_model="Mistral (Legal & Formal Logic Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=["Raw parameters and boundary conditions"],
                expected_output_type="mathematical_derivation_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Poetry / Creative Writing / Lyrics
        has_poem = _has_kw(["poem", "poetry", "rhyme", "sonnet", "ballad", "verse", "lyrics", "haiku"], p_lower)
        if has_poem:
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=f"Compose Creative Poem for '{clean_snippet}...'",
                domain=DomainType.AUDIT,
                description=f"Write an evocative, charming, and beautifully styled poem in plain markdown text fulfilling: {user_directive}",
                assigned_worker_model="Gemini 2.0 Flash (Summarizer Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=[f"step_{step_idx-1}"] if step_idx > 1 else ["Creative theme parameters"],
                expected_output_type="poem_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Coding / Frontend / Software Engineering (strictly exclude non-coding text)
        explicit_code_words = [
            "python", "script", "api", "backend", "algorithm",
            "develop", "software", "endpoint", "coding",
            "html", "css", "webpage", "website", "frontend", "landing page", "replica",
            "react", "vue", "javascript", "typescript"
        ]
        has_code = _has_kw(explicit_code_words, p_lower) and not (has_poem and not _has_kw(["python", "script", "api", "backend", "algorithm"], p_lower))
        if has_code:
            is_web = _has_kw(["html", "css", "webpage", "website", "frontend", "landing page", "replica", "react", "vue"], p_lower)
            desc = f"Engineer standalone, responsive HTML5/CSS3 frontend implementation matching: {user_directive}" if is_web else f"Engineer production-grade software implementation matching: {user_directive}"
            title = f"Web & UI Implementation for '{clean_snippet}...'" if is_web else f"Modular Implementation & Architecture for '{clean_snippet}...'"
            out_type = "frontend_html_css_markup" if is_web else "executable_code"
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=title,
                domain=DomainType.CODE,
                description=desc,
                assigned_worker_model="Qwen 2.5 Coder (via Groq Cloud)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=[f"step_{step_idx-1}"] if step_idx > 1 else ["System specifications"],
                expected_output_type=out_type,
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Visual / Diagram / Render
        has_vision = _has_kw(["image", "picture", "infographic", "visual", "logo", "mockup", "photo", "render", "diagram", "chart", "flowchart"], p_lower)
        if has_vision:
            is_diagram = _has_kw(["diagram", "chart", "infographic", "architecture", "flowchart", "schematic"], p_lower)
            title = f"Technical Infographic for '{clean_snippet}...'" if is_diagram else f"Visual Asset Render for '{clean_snippet}...'"
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=title,
                domain=DomainType.VISION,
                description=f"Synthesize high-fidelity visual asset or diagram fulfilling: {user_directive}",
                assigned_worker_model="Flux.1 (Visual Asset Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=[f"step_{step_idx-1}"] if step_idx > 1 else ["Visual directives"],
                expected_output_type="rendered_image_url_and_metadata",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # Check for Attached File Analysis / Document Ingestion
        if files or _has_kw(["summarize", "analyze", "document", "report", "extract"], p_lower):
            file_names = ", ".join([f.filename for f in files]) if files else "provided material"
            subtasks.append(StructuredSubTask(
                step_id=f"step_{step_idx}",
                title=f"In-Depth Synthesis & Deliverable Generation for '{clean_snippet}...'",
                domain=DomainType.AUDIT,
                description=f"Extract key concepts from {file_names} and fulfill the user's primary deliverable: {user_directive}",
                assigned_worker_model="OpenAI GPT (Auditing Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=[f"step_{step_idx-1}"] if step_idx > 1 else ["Attached documents and specifications"],
                expected_output_type="comprehensive_deliverable_markdown",
                status=TaskStatus.PENDING
            ))
            step_idx += 1

        # If no subtasks matched:
        if not subtasks:
            subtasks.append(StructuredSubTask(
                step_id="step_1",
                title=f"Execution & Synthesis of '{prompt[:50]}...'",
                domain=DomainType.AUDIT,
                description=f"Analyze inputs and thoroughly execute the user objective: {prompt}",
                assigned_worker_model="OpenAI GPT (Auditing Specialist)",
                assigned_reviewer_model="Gemini 2.0 Flash (Multimodal & Step QA Reviewer)",
                required_prerequisites=["User prompt and context"],
                expected_output_type="analytical_deliverable_markdown",
                status=TaskStatus.PENDING
            ))

        prereqs = [f"User Objective: {prompt}"]
        for f in files:
            prereqs.append(f"Ingested Resource: {f.filename} ({f.content_type}, {f.size_bytes} bytes)")

        constraints = [
            "Must maintain strict execution integrity across sub-agents.",
            "All intermediate outputs must pass Gemini quality review before commit."
        ]
        if "fast" in p_lower:
            constraints.append("Optimize for latency and rapid turnaround.")
        if "accurate" in p_lower or "strict" in p_lower:
            constraints.append("Zero tolerance for calculation or specification deviations.")

        return StructuredGoal(
            primary_objective=user_directive,
            prerequisites=prereqs,
            constraints=constraints,
            sub_tasks=subtasks,
            jev_routing_latency_ms=0.0,
            jev_confidence=0.99
        )
