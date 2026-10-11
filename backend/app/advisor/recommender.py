import json
import re
import httpx
from typing import List, Dict, Any, Optional
from app.models.schemas import ToolRecommendation, AdvisorResponse
from app.advisor.tools_catalog import AI_TOOLS_CATALOG
from app.config import config

class AIAdvisorEngine:
    """
    Track 1: Free AI Advisor & Suggester.
    Deeply analyzes user requests using live LLM reasoning (Google Gemini & Jev System 1)
    to deconstruct goals, select optimal benchmark tools from the catalog,
    and generate custom production-grade prompt templates and DIY execution blueprints.
    """
    def __init__(self):
        self.catalog = AI_TOOLS_CATALOG
        self.gemini_key = config.GEMINI_API_KEY
        self.groq_key = config.GROQ_API_KEY
        self.beat_key = config.BEAT_API_KEY

        # Build a compact text representation of the tools catalog for prompt context
        self.catalog_context = "\n".join([
            f"- [{t['name']}] (Provider: {t['provider']} | Category: {t['category']} | Free: {t['is_free']} | Tier: {t['pricing_tier']}): {t['description']} Strengths: {', '.join(t.get('strengths', []))}"
            for t in self.catalog
        ])

    async def advise_async(self, user_query: str, delivery_mode: str = "smart") -> AdvisorResponse:
        """
        Primary LLM-powered advisory engine.
        Uses live Gemini 3.5 Flash / Groq to understand nuanced requirements and prescribe tools.
        Supports 'smart' (anticipatory insights + starter gifts) and 'strict' modes.
        """
        # 1. Try Gemini 3.5 Flash Lite (First choice: fast, intelligent, structured JSON)
        if self.gemini_key:
            try:
                gemini_resp = await self._call_gemini_advisor(user_query, delivery_mode=delivery_mode)
                if gemini_resp:
                    return gemini_resp
            except Exception as e:
                print(f"[AI Advisor] Gemini call error: {e}. Attempting Groq fallback.")

        # 2. Try Groq Cloud (Secondary LLM fallback: sub-second inference)
        if self.groq_key:
            try:
                groq_resp = await self._call_groq_advisor(user_query, delivery_mode=delivery_mode)
                if groq_resp:
                    return groq_resp
            except Exception as e:
                print(f"[AI Advisor] Groq call error: {e}. Falling back to baseline recommender.")

        # 3. Deterministic Safety Fallback (Guarantees zero-failure if all APIs are offline)
        return self._deterministic_fallback(user_query, delivery_mode=delivery_mode)

    def advise(self, user_query: str, delivery_mode: str = "smart") -> AdvisorResponse:
        """
        Synchronous wrapper for backwards compatibility.
        """
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If running within an active event loop, run in a separate task or thread
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    return executor.submit(asyncio.run, self.advise_async(user_query, delivery_mode=delivery_mode)).result()
            else:
                return loop.run_until_complete(self.advise_async(user_query, delivery_mode=delivery_mode))
        except Exception:
            return self._deterministic_fallback(user_query, delivery_mode=delivery_mode)

    def _build_advisor_prompt(self, user_query: str, delivery_mode: str = "smart") -> str:
        overdeliver_rule = ""
        if delivery_mode in ["smart", "overdeliver"]:
            overdeliver_rule = (
                "5. PROACTIVE ANTICIPATORY INTELLIGENCE (SMART MODE ACTIVATED):\n"
                "   The user has selected 'Smart Mode'. Beyond fulfilling their core request, you MUST anticipate their blind spots and provide valuable complimentary starter assets:\n"
                "   - 'anticipated_blind_spots': A list of 4-6 critical domain gotchas the user didn't explicitly think to ask about (e.g. audience psychology, hidden regulatory/COPPA pitfalls, pacing and audio retention drivers, sensory overload, common beginner mistakes).\n"
                "   - 'complimentary_starter_pack': A dictionary containing high-value bonus assets tailored to their goal:\n"
                "     * 'pilot_starter_script': A ready-to-use 60-second pilot script or starter template.\n"
                "     * 'sensory_and_audio_formula': Exact recommended music style, BPM, voice cadence, and audio cues.\n"
                "     * 'visual_style_and_thumbnail_prompt': Exact Midjourney/Flux prompt for a high-CTR thumbnail or character key visual.\n"
                "     * 'retention_and_launch_checklist': 4-5 bullet points of crucial do's and don'ts before publishing.\n\n"
            )
        else:
            overdeliver_rule = (
                "5. STRICT DIRECT EXECUTION MODE:\n"
                "   The user has selected 'Strict Mode'. Deliver strictly and concisely only what was asked. Leave 'anticipated_blind_spots' as an empty array [] and 'complimentary_starter_pack' as an empty dictionary {}.\n\n"
            )

        return (
            "You are the Lead AI Architecture Advisor for OmniTask AI.\n"
            f"Analyze this complex user goal deeply:\n"
            f"\"{user_query}\"\n\n"
            "Break this goal down into logical, sequential execution phases (e.g. 'Phase 1: ...', 'Phase 2: ...').\n"
            "Then, prescribe the optimal AI tools from the catalog below to execute each phase.\n\n"
            "MANDATORY ARCHITECTURAL RULES:\n"
            "1. STRICT CHRONOLOGICAL PHASE ORDER:\n"
            "   - You MUST list the recommended AI tools strictly in chronological order of the phases where they are first used (Phase 1 tools first, Phase 2 tools second, Phase 3 tools third, etc.).\n"
            "2. EXPLICIT PHASE ASSIGNMENTS & MULTI-PHASE DEDUPLICATION:\n"
            "   - Every tool recommendation MUST include 'assigned_phases': [int] listing all phase numbers where it is used (e.g. [1, 2] or [4]).\n"
            "   - If one tool is used across MULTIPLE phases (e.g. Gemini 2.0 Flash used in Phase 1 for research and Phase 2 for scriptwriting), do NOT create multiple cards or duplicate entries for that tool! Include that tool ONCE, put all its phases in 'assigned_phases' (e.g. [1, 2]), and supply a dedicated, tailored prompt for EACH phase in 'phase_prompts'.\n"
            "3. STRICTLY TOP 1 BEST AI PER WORK / CAPABILITY (NO REDUNDANCY):\n"
            "   - Never suggest multiple competing models for the same job (e.g., do NOT suggest both Gemini and Claude or ChatGPT for general writing/research; choose strictly the SINGLE BEST model for each distinct job).\n"
            "   - If multiple DIFFERENT AI tools are needed in the same phase for distinct capabilities (e.g. Phase 5 requires Runway Gen-3 for video clips and Suno AI for background music), you may recommend both, with both tagged for Phase 5.\n"
            "4. HIGHLY RELEVANT, PRODUCTION-READY PROMPTS (NO HALLUCINATIONS):\n"
            f"   - Every prompt MUST be tailored directly, specifically, and accurately to the user's objective: \"{user_query}\".\n"
            "   - NEVER hallucinate or insert random unrelated fictional stories, animals, or characters (e.g. NEVER mention 'friendly elephant', 'friendly dinosaur', etc., unless explicitly asked for by the user).\n"
            "   - For downstream phases, use clear, smart handoff placeholders like:\n"
            "     '[Insert narrative script generated in Phase 2 here]'\n"
            "     '[Insert character / storyboard description from Phase 3 here]'\n"
            "     '[Insert structured research data from Phase 1 here]'\n\n"
            f"{overdeliver_rule}"
            f"AVAILABLE AI TOOLS CATALOG:\n{self.catalog_context}\n\n"
            "Output must be a strictly valid JSON object matching this schema:\n"
            "{\n"
            '  "task_decomposition": ["Phase 1: ...", "Phase 2: ..."],\n'
            '  "recommendations": [\n'
            "    {\n"
            '      "tool_name": "Exact Tool Name from catalog",\n'
            '      "category": "Domain Category",\n'
            '      "provider": "Provider Name",\n'
            '      "description": "Short tool summary",\n'
            '      "why_recommended": "Specific technical reason why this tool is ideal for this user objective",\n'
            '      "is_free": true,\n'
            '      "pricing_tier": "Free / Freemium / Paid",\n'
            '      "assigned_phases": [1, 2],\n'
            '      "phase_prompts": [\n'
            "        {\n"
            '          "phase": 1,\n'
            '          "phase_title": "Phase 1: Milestone Title",\n'
            '          "prompt": "Ready-to-use copy-pasteable prompt for Phase 1 tailored directly to user goal"\n'
            "        },\n"
            "        {\n"
            '          "phase": 2,\n'
            '          "phase_title": "Phase 2: Milestone Title",\n'
            '          "prompt": "Ready-to-use copy-pasteable prompt for Phase 2 with handoff placeholder [Insert output from Phase 1]"\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ],\n"
            '  "diy_execution_blueprint": [\n'
            "    {\n"
            '      "step": 1,\n'
            '      "action": "Milestone action description",\n'
            '      "recommended_tool": "Tool name",\n'
            '      "instruction": "Step-by-step guidance on how to run this tool and pass its output downstream",\n'
            '      "expected_output": "Concrete deliverable file or artifact"\n'
            "    }\n"
            "  ],\n"
            '  "delivery_mode": "' + delivery_mode + '",\n'
            '  "anticipated_blind_spots": [\n'
            '    "Anticipated Gotcha 1 (What the user did not think to ask)...",\n'
            '    "Anticipated Gotcha 2..."\n'
            "  ],\n"
            '  "complimentary_starter_pack": {\n'
            '    "pilot_starter_script": "Ready-to-use starter template or pilot script tailored to goal",\n'
            '    "sensory_and_audio_formula": "Exact music style, BPM, and voice cadence",\n'
            '    "visual_style_and_thumbnail_prompt": "Midjourney/Flux prompt for key visual or thumbnail",\n'
            '    "retention_and_launch_checklist": [\n'
            '      "Checklist item 1...",\n'
            '      "Checklist item 2..."\n'
            "    ]\n"
            "  }\n"
            "}"
        )

    async def _call_gemini_advisor(self, user_query: str, delivery_mode: str = "overdeliver") -> Optional[AdvisorResponse]:
        """
        Calls Google Gemini using structured JSON mode to analyze the user's objective.
        """
        prompt = self._build_advisor_prompt(user_query, delivery_mode=delivery_mode)
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2
            }
        }
        models = ["gemini-flash-latest", "gemini-1.5-flash-latest", "gemini-1.5-pro-latest"]
        async with httpx.AsyncClient(timeout=15.0) as client:
            for model_id in models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={self.gemini_key}"
                try:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                        parsed = json.loads(raw_text)

                        # Handle case where LLM returns a list with single dict
                        if isinstance(parsed, list) and len(parsed) > 0:
                            parsed = parsed[0]

                        return self._parse_to_advisor_response(user_query, parsed, delivery_mode=delivery_mode)
                    else:
                        print(f"[AI Advisor] Gemini model {model_id} returned status {resp.status_code}")
                except Exception as e:
                    print(f"[AI Advisor] Gemini model {model_id} failed: {e}")
        return None

    async def _call_groq_advisor(self, user_query: str, delivery_mode: str = "overdeliver") -> Optional[AdvisorResponse]:
        """
        Calls Groq Cloud with JSON mode and explicit schema.
        """
        system_prompt = self._build_advisor_prompt(user_query, delivery_mode=delivery_mode)

        async with httpx.AsyncClient(timeout=14.0) as client:
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
                        {"role": "user", "content": f"User Goal: {user_query}"}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                return self._parse_to_advisor_response(user_query, parsed, delivery_mode=delivery_mode)
        return None

    def _sanitize_prompt(self, prompt: str, user_query: str, phase: int, tool_name: str) -> str:
        """
        Ensures prompt is strictly relevant to user query without hallucinated story tropes
        and includes clean, professional handoff placeholders.
        """
        q_lower = user_query.lower()
        hallucinated_tropes = [
            "friendly elephant", "friendly dinosaur", "wise owl", "curious bunny",
            "bouncing kangaroo", "magic tree", "talking cloud"
        ]
        for trope in hallucinated_tropes:
            if trope in prompt.lower() and trope not in q_lower:
                prompt = re.sub(re.escape(trope), user_query, prompt, flags=re.IGNORECASE)

        # Ensure voiceover tools (ElevenLabs) have direct script handoffs
        if "elevenlabs" in tool_name.lower():
            if "[insert" not in prompt.lower() and ("once upon a time" in prompt.lower() or "story of" in prompt.lower()):
                prompt = (
                    f"Narration Voiceover Instructions for: {user_query}\n"
                    f"Tone & Voice: Warm, articulate, and engaging narrator suitable for the target audience.\n"
                    f"Pacing: 135-145 WPM, clear pauses between key points.\n\n"
                    f"Script to synthesize:\n\"\"\"\n[Insert approved voiceover script generated in Phase {max(1, phase - 1)}]\n\"\"\""
                )
        return prompt

    def _get_capability_cluster(self, tool_name: str, category: str) -> str:
        """
        Groups tools into functional capability clusters to enforce top-1 model per job.
        """
        t_lower = tool_name.lower()
        c_lower = category.lower()
        if "wolfram" in t_lower:
            return "computational_math"
        if "cursor" in t_lower:
            return "ide_editor"
        if any(k in t_lower for k in ["gemini", "claude", "chatgpt", "gpt", "o3", "deepseek", "perplexity", "notebooklm"]) or any(k in c_lower for k in ["research", "coding", "reasoning", "general", "text", "script"]):
            return "text_reasoning_scripting"
        if any(k in t_lower for k in ["runway", "kling", "sora", "pika"]) or "video" in c_lower:
            return "video_generation"
        if any(k in t_lower for k in ["midjourney", "flux", "ideogram", "dall-e"]) or "image" in c_lower:
            return "image_generation"
        if "elevenlabs" in t_lower or "voice" in c_lower:
            return "voice_audio"
        if "suno" in t_lower or "udio" in t_lower or "music" in c_lower:
            return "music_audio"
        return f"custom_{category}"

    def _generate_default_blind_spots(self, user_query: str) -> List[str]:
        q = user_query.lower()
        if any(w in q for w in ["kids", "child", "children", "toddler", "youtube kids", "yt kids"]):
            return [
                "COPPA & Policy Compliance: Marking content as 'Made for Kids' disables comments, personalized ads, and end-screens. Failure to comply can risk immediate FTC fines and YouTube channel termination.",
                "The 15-Second Retention Drop: Children's attention spans are fleeting. Avoid static logo introductions; jump directly into motion, sound effects, or an interactive question within 3 seconds.",
                "Acoustic Overstimulation Pitfall: While playful music is critical, harsh dissonant sounds or chaotic mixing cause sensory fatigue. Use soft marimba, ukulele, or bells at ~110-120 BPM mixed at -18dB under dialogue.",
                "Color Contrast in Thumbnails: Toddlers and young children gravitate toward bright, saturated primary colors (yellow, cyan, magenta) with exaggerated joyful facial expressions.",
                "The Repetitive Watchability Formula: Children re-watch videos 10-50 times when dialogue incorporates rhythmic repeating catchphrases or rhyming motifs."
            ]
        elif any(w in q for w in ["trading", "crypto", "finance", "bot", "algorithm", "stock", "arbitrage"]):
            return [
                "Slippage & Real-Time Liquidity Arbitrage: Paper trading backtests often fail in live markets because order book liquidity gaps and maker/taker exchange fees are ignored.",
                "Exchange API Rate Limits & IP Bans: Centralized exchanges throttle rapid requests. A missing token bucket queue will ban your server IP address mid-execution.",
                "Overfitting Backtest Curse: Optimizing strategy parameters to historical curve data creates false confidence. Always use Walk-Forward Cross Validation across distinct bull and bear regimes.",
                "WebSocket State Desynchronization: Real-time order book event streams can drop packets silently. Implement sequence-number reconciliation and periodic REST snapshot syncs."
            ]
        elif any(w in q for w in ["code", "software", "saas", "api", "python", "app", "web"]):
            return [
                "Premature Optimization vs. Architecture Debt: Avoid building distributed microservices before core business logic and schema invariants are stabilized.",
                "State Mutation & Concurrency Race Conditions: Unsynchronized global state leads to phantom data corruption under production traffic.",
                "Defensive API Boundaries: Missing Pydantic / TypeScript schema validation on external inputs creates cascading type errors downstream.",
                "Continuous Integration & Lint Gates: Automated formatting and type-checking prevent 70% of integration regressions before deployment."
            ]
        else:
            return [
                "Audience Attention Span & The Lead: Decision makers spend under 90 seconds reviewing summaries. Lead with bottom-line impact and measurable outcomes before methodology.",
                "Data Hygiene & Verification: 80% of process failures stem from unnormalized inputs, missing timestamps, or unverified secondary sources.",
                "Actionability Deficit: A metric without an operational intervention threshold is merely trivia. Pair every finding with a concrete next step.",
                "Downstream Dependency Risk: Failing to define handoff contracts between phases causes bottleneck delays during handoffs."
            ]

    def _generate_default_starter_pack(self, user_query: str) -> Dict[str, Any]:
        q = user_query.lower()
        if any(w in q for w in ["kids", "child", "children", "toddler", "youtube kids", "yt kids"]):
            return {
                "pilot_starter_script": (
                    "Title: The Magic Cloud's Raindrop Adventure (60s Pilot)\n\n"
                    "[Visual: Vibrant, high-contrast 3D animated scene opens with a fluffy smiling cloud floating over green rolling hills]\n"
                    "NARRATOR (Enthusiastic, playful, 135 WPM):\n"
                    "\"Hello little explorers! Look up at the sky... Can you see the puffy white cloud? [Bell chime: Ding!]\n"
                    "Meet Barnaby the Cloud! Today, Barnaby is full of tiny water drops. Let's count them together: 1... 2... 3! SPLASH! [Cheerful splash sound effect]\n"
                    "Barnaby is bringing gentle rain to help the baby flowers grow! Can you wiggle your fingers like falling rain? Pitter-patter, pitter-patter!\n"
                    "Great job! Barnaby is smiling! See you on our next weather adventure!\" [Cheerful outro chord]"
                ),
                "sensory_and_audio_formula": (
                    "- Voice Profile: Warm, energetic maternal/paternal tone with dynamic pitch variation, 135-140 WPM.\n"
                    "- Music Bed: Cheerful acoustic ukulele and bright xylophone, 115 BPM, master mix at -18dB under speech.\n"
                    "- Sound Effects Palette: Organic soft bubble pops, pleasant rain trickles, gentle bell rings (avoid harsh buzzers)."
                ),
                "visual_style_and_thumbnail_prompt": (
                    "Midjourney v6.1 Prompt: /imagine prompt: Vibrant 3D Pixar animation style, joyful smiling puffy cloud character holding a golden watering can, bright rainbow and green rolling hills in background, big curious expressive eyes, 8k resolution, cinematic soft lighting, 16:9 aspect ratio --ar 16:9 --v 6.1"
                ),
                "retention_and_launch_checklist": [
                    "Always configure the COPPA rating to 'Yes, it's Made for Kids' in YouTube Studio upload defaults.",
                    "Ensure voiceover repeats the central concept phrase at least 3 times in distinct scenes.",
                    "Keep visual scene cuts between 2.0 to 3.0 seconds to maintain high toddler engagement.",
                    "Test audio mix on phone and tablet speakers at 50% volume to ensure narration clarity."
                ]
            }
        elif any(w in q for w in ["trading", "crypto", "finance", "bot", "algorithm", "stock", "arbitrage"]):
            return {
                "pilot_starter_script": (
                    "# Python 3.12 Resilient Trading Loop Boilerplate with Backoff\n"
                    "import asyncio, time\n\n"
                    "class ResilientOrderExecutor:\n"
                    "    def __init__(self, max_retries=3, risk_limit_pct=1.5):\n"
                    "        self.max_retries = max_retries\n"
                    "        self.risk_limit_pct = risk_limit_pct\n\n"
                    "    async def execute_order_with_backoff(self, symbol, side, qty):\n"
                    "        for attempt in range(1, self.max_retries + 1):\n"
                    "            try:\n"
                    "                print(f'[Order] {side} {qty} {symbol} (Attempt {attempt})')\n"
                    "                return {'status': 'FILLED', 'symbol': symbol, 'qty': qty}\n"
                    "            except Exception as e:\n"
                    "                await asyncio.sleep(2 ** attempt)\n"
                    "        raise RuntimeError('Max order placement retries exhausted.')\n"
                ),
                "sensory_and_audio_formula": (
                    "- Risk Management Mandate: Never risk exceeding 1.5% of total portfolio equity per position.\n"
                    "- Order Execution: Enforce hard server-side stop losses rather than relying on local client triggers.\n"
                    "- Telemetry: Log slippage coefficients between expected quote and final fill price."
                ),
                "visual_style_and_thumbnail_prompt": (
                    "Ideogram 2.0 Prompt: Clean dark mode algorithmic trading analytics dashboard UI, glowing neon emerald candlestick charts, glassmorphism telemetry widgets, 8k resolution, modern typography."
                ),
                "retention_and_launch_checklist": [
                    "Verify paper trading performance across a minimum of 1,000 simulated trades before capital deployment.",
                    "Isolate API secret keys inside encrypted environment variables with IP whitelisting enabled.",
                    "Configure automated Discord or Telegram webhook alerts on all critical exception handlers."
                ]
            }
        else:
            return {}

    def _parse_to_advisor_response(self, user_query: str, parsed: Dict[str, Any], delivery_mode: str = "overdeliver") -> AdvisorResponse:
        """
        Validates, enriches, deduplicates, and sorts into strongly-typed AdvisorResponse.
        Enforces:
        1. Strict chronological phase ordering (min assigned phase).
        2. Deduplication of multi-phase models into a single card with phase badges and per-phase prompts.
        3. Strict Top-1 model per capability job.
        4. Hallucination-free prompts with clear handoffs.
        5. Anticipatory intelligence & starter packs in overdeliver mode.
        """
        from app.models.schemas import PhasePrompt

        raw_decomp = parsed.get("task_decomposition", [])
        if not isinstance(raw_decomp, list):
            raw_decomp = [str(raw_decomp)]

        # Standardize decomposition phase labeling
        decomposition: List[str] = []
        for idx, stage in enumerate(raw_decomp):
            s_text = str(stage).strip()
            # If formatted as "Step X:", convert to "Phase X:"
            if re.match(r'^Step\s*\d+[:.]', s_text, flags=re.IGNORECASE):
                s_text = re.sub(r'^Step\s*(\d+)[:.]', r'Phase \1:', s_text, flags=re.IGNORECASE)
            elif not re.match(r'^Phase\s*\d+[:.]', s_text, flags=re.IGNORECASE):
                s_text = f"Phase {idx + 1}: {s_text}"
            decomposition.append(s_text)

        if not decomposition:
            decomposition = [
                f"Phase 1: Architecture Formulation & Research for '{user_query[:50]}'",
                "Phase 2: Core Asset & Logic Implementation",
                "Phase 3: Verification, Audio/Visual Packaging & Delivery"
            ]

        # Helper to find tool in catalog
        def find_in_catalog(t_name: str) -> Optional[Dict[str, Any]]:
            if not t_name:
                return None
            norm = t_name.lower().replace("-", " ").replace("_", " ")
            for item in self.catalog:
                i_name = item.get("name", "").lower()
                if i_name in norm or norm in i_name:
                    return item
            return None

        raw_recs = parsed.get("recommendations", [])
        tool_map: Dict[str, ToolRecommendation] = {}

        for idx, r in enumerate(raw_recs):
            if not isinstance(r, dict):
                continue

            t_name = r.get("tool_name") or r.get("tool") or r.get("name") or r.get("model") or "Specialized AI Tool"
            cat = r.get("category") or r.get("domain") or r.get("type") or "General AI"
            prov = r.get("provider") or r.get("company") or r.get("vendor") or "Independent"
            desc = r.get("description") or r.get("summary") or r.get("overview") or ""
            why_rec = r.get("why_recommended") or r.get("purpose") or r.get("reason") or r.get("why") or f"Top-tier performance and suitability for {user_query}."
            is_free_val = r.get("is_free", False)
            if isinstance(is_free_val, str):
                is_free_val = is_free_val.lower() in ["true", "1", "yes", "free"]
            pricing = r.get("pricing_tier", "Freemium")

            # Catalog enrichment
            cat_match = find_in_catalog(t_name)
            if cat_match:
                t_name = cat_match.get("name", t_name)
                prov = cat_match.get("provider", prov)
                desc = cat_match.get("description", desc)
                cat = cat_match.get("category", cat)
                if "is_free" not in r:
                    is_free_val = cat_match.get("is_free", is_free_val)
                if "pricing_tier" not in r:
                    pricing = cat_match.get("pricing_tier", pricing)

            # 1. Extract assigned_phases
            raw_phases = r.get("assigned_phases") or r.get("phases") or r.get("phase") or []
            if isinstance(raw_phases, (int, str)):
                raw_phases = [raw_phases]
            clean_phases: List[int] = []
            for item in raw_phases:
                if isinstance(item, int):
                    clean_phases.append(item)
                elif isinstance(item, str):
                    digits = re.findall(r'\d+', item)
                    if digits:
                        clean_phases.append(int(digits[0]))

            # 2. Extract phase_prompts
            raw_prompts = r.get("phase_prompts") or r.get("prompts") or []
            clean_prompts: List[PhasePrompt] = []
            if isinstance(raw_prompts, list):
                for p_item in raw_prompts:
                    if isinstance(p_item, dict):
                        p_phase = p_item.get("phase")
                        if isinstance(p_phase, str):
                            d = re.findall(r'\d+', p_phase)
                            p_phase = int(d[0]) if d else 1
                        elif not isinstance(p_phase, int):
                            p_phase = clean_phases[0] if clean_phases else (idx + 1)

                        p_title = p_item.get("phase_title") or p_item.get("title") or f"Phase {p_phase}"
                        p_text = p_item.get("prompt") or p_item.get("text") or ""
                        if p_text:
                            clean_prompts.append(PhasePrompt(
                                phase=p_phase,
                                phase_title=p_title,
                                prompt=self._sanitize_prompt(p_text, user_query, p_phase, t_name)
                            ))
                            if p_phase not in clean_phases:
                                clean_phases.append(p_phase)

            # Fallback if phase_prompts empty
            sample_p = r.get("sample_prompt") or r.get("prompt") or r.get("prompt_template") or ""
            if not clean_phases:
                clean_phases = [idx + 1]

            if not clean_prompts:
                if not sample_p or sample_p.startswith("Assist me with:"):
                    sample_p = (
                        f"Act as a principal specialist in {cat}. My goal is: {user_query}.\n"
                        f"Execute this phase with production-grade precision using {t_name}."
                    )
                for ph in clean_phases:
                    clean_prompts.append(PhasePrompt(
                        phase=ph,
                        phase_title=f"Phase {ph} Execution",
                        prompt=self._sanitize_prompt(sample_p, user_query, ph, t_name)
                    ))

            clean_phases = sorted(list(set(clean_phases)))
            clean_prompts.sort(key=lambda p: p.phase)
            primary_prompt = clean_prompts[0].prompt if clean_prompts else sample_p

            tool_key = t_name.lower().strip()
            # Deduplicate: if tool already exists, merge phases and prompts into single card!
            if tool_key in tool_map:
                existing = tool_map[tool_key]
                merged_phases = sorted(list(set(existing.assigned_phases + clean_phases)))
                existing.assigned_phases = merged_phases
                existing_phases_set = {p.phase for p in existing.phase_prompts}
                for cp in clean_prompts:
                    if cp.phase not in existing_phases_set:
                        existing.phase_prompts.append(cp)
                        existing_phases_set.add(cp.phase)
                existing.phase_prompts.sort(key=lambda p: p.phase)
                if existing.phase_prompts:
                    existing.sample_prompt = existing.phase_prompts[0].prompt
            else:
                tool_map[tool_key] = ToolRecommendation(
                    category=cat,
                    tool_name=t_name,
                    provider=prov,
                    description=desc,
                    why_recommended=why_rec,
                    sample_prompt=primary_prompt,
                    is_free=bool(is_free_val),
                    pricing_tier=pricing,
                    assigned_phases=clean_phases,
                    phase_prompts=clean_prompts
                )

        if not tool_map:
            return self._deterministic_fallback(user_query, delivery_mode=delivery_mode)

        # 3. Enforce TOP 1 BEST AI per work/capability:
        cluster_map: Dict[str, ToolRecommendation] = {}
        filtered_tools: List[ToolRecommendation] = []

        for tool in tool_map.values():
            cluster = self._get_capability_cluster(tool.tool_name, tool.category)
            if cluster in cluster_map:
                retained = cluster_map[cluster]
                for p_num in tool.assigned_phases:
                    if p_num not in retained.assigned_phases:
                        retained.assigned_phases.append(p_num)
                retained.assigned_phases.sort()
                retained_phases_set = {p.phase for p in retained.phase_prompts}
                for pp in tool.phase_prompts:
                    if pp.phase not in retained_phases_set:
                        retained.phase_prompts.append(pp)
                        retained_phases_set.add(pp.phase)
                retained.phase_prompts.sort(key=lambda p: p.phase)
            else:
                cluster_map[cluster] = tool
                filtered_tools.append(tool)

        # 4. STRICT CHRONOLOGICAL ORDERING BY MIN ASSIGNED PHASE
        filtered_tools.sort(key=lambda r: min(r.assigned_phases) if r.assigned_phases else 999)

        # 5. Format DIY Blueprints
        blueprints = parsed.get("diy_execution_blueprint", [])
        formatted_blueprints: List[Dict[str, Any]] = []
        for idx, b in enumerate(blueprints):
            if isinstance(b, dict):
                step_val = b.get("step", idx + 1)
                try:
                    step_num = int(step_val)
                except Exception:
                    step_num = idx + 1

                action = b.get("action") or b.get("title") or b.get("milestone")
                if not action and isinstance(step_val, str) and not step_val.strip().isdigit():
                    action = step_val.strip()
                if not action:
                    action = f"Phase {step_num}: System Implementation"

                rec_tool = b.get("recommended_tool") or b.get("tool") or b.get("model") or b.get("tool_name")
                if not rec_tool or rec_tool == "AI Model":
                    rec_tool = filtered_tools[min(idx, len(filtered_tools) - 1)].tool_name

                actions_list = b.get("actions")
                if isinstance(actions_list, list) and actions_list:
                    instruction = " ".join([str(a) for a in actions_list])
                else:
                    instruction = b.get("instruction") or b.get("guidance") or b.get("description") or f"Deploy {rec_tool} to complete {action} according to system architecture."

                expected = b.get("expected_output") or b.get("deliverable") or b.get("output") or f"Verified {action} artifact & implementation specification"

                formatted_blueprints.append({
                    "step": step_num,
                    "action": action,
                    "recommended_tool": rec_tool,
                    "instruction": instruction,
                    "expected_output": expected
                })

        # 6. Extract Anticipated Blind Spots and Complimentary Starter Pack
        anticipated_blind_spots: List[str] = []
        complimentary_starter_pack: Dict[str, Any] = {}

        if delivery_mode in ["smart", "overdeliver"]:
            raw_spots = parsed.get("anticipated_blind_spots") or parsed.get("blind_spots") or []
            if isinstance(raw_spots, list) and raw_spots:
                anticipated_blind_spots = [str(s) for s in raw_spots if s]
            else:
                anticipated_blind_spots = self._generate_default_blind_spots(user_query)

            raw_pack = parsed.get("complimentary_starter_pack") or parsed.get("starter_pack") or {}
            if isinstance(raw_pack, dict) and raw_pack:
                complimentary_starter_pack = raw_pack
            else:
                complimentary_starter_pack = self._generate_default_starter_pack(user_query)
        else:
            anticipated_blind_spots = []
            complimentary_starter_pack = {}

        return AdvisorResponse(
            original_query=user_query,
            task_decomposition=decomposition,
            recommendations=filtered_tools,
            diy_execution_blueprint=formatted_blueprints,
            delivery_mode="smart" if delivery_mode in ["smart", "overdeliver"] else "strict",
            anticipated_blind_spots=anticipated_blind_spots,
            complimentary_starter_pack=complimentary_starter_pack
        )

    def _deterministic_fallback(self, user_query: str, delivery_mode: str = "smart") -> AdvisorResponse:
        """
        Dynamic semantic fallback adhering strictly to:
        1. Chronological phase order
        2. Top 1 AI per capability
        3. Multi-phase deduplication with phase badges & phase prompts
        4. Clear handoff placeholders without hallucinations
        5. Anticipatory intelligence & starter pack in overdeliver mode
        """
        from app.models.schemas import PhasePrompt

        q_lower = user_query.lower()
        is_video = any(w in q_lower for w in ["video", "youtube", "clip", "animation", "podcast", "movie", "reel"])
        is_code = any(w in q_lower for w in ["code", "software", "bot", "saas", "api", "python", "trading", "app", "web"])
        is_data = any(w in q_lower for w in ["data", "csv", "analysis", "revenue", "math", "forecast", "report"])

        recommendations: List[ToolRecommendation] = []
        decomposition: List[str] = []
        diy_blueprint: List[Dict[str, Any]] = []

        if is_video:
            decomposition = [
                "Phase 1: Topic Discovery & Target Audience Research",
                "Phase 2: Narrative Scriptwriting & Dialogue Structuring",
                "Phase 3: Visual Storyboarding & Art Direction",
                "Phase 4: Voiceover Narration & Speech Synthesis",
                "Phase 5: Cinematic Video Clip Generation & Motion Synthesis",
                "Phase 6: Audio Score & Background Music Composition"
            ]

            # 1. Gemini (Phase 1 & 2)
            gemini_tool = next((t for t in self.catalog if "gemini" in t["name"].lower()), self.catalog[0])
            recommendations.append(ToolRecommendation(
                category="Research & Scriptwriting",
                tool_name=gemini_tool["name"],
                provider=gemini_tool["provider"],
                description=gemini_tool["description"],
                why_recommended="Multimodal research engine with huge context for deep topic discovery and structured scriptwriting.",
                sample_prompt=f"Act as an educational content strategist. Research and define key retention hooks and core concepts for: {user_query}.",
                is_free=gemini_tool.get("is_free", True),
                pricing_tier=gemini_tool.get("pricing_tier", "Freemium"),
                assigned_phases=[1, 2],
                phase_prompts=[
                    PhasePrompt(
                        phase=1,
                        phase_title="Phase 1: Topic Discovery & Audience Research",
                        prompt=f"Act as an expert researcher and educational creator. For the project '{user_query}', provide:\n1. Core audience psychological triggers and retention hooks.\n2. 5 critical conceptual points that must be explained clearly.\n3. Common misconceptions to clarify.\nFormat as structured bullet points."
                    ),
                    PhasePrompt(
                        phase=2,
                        phase_title="Phase 2: Narrative Scriptwriting",
                        prompt=f"Using the verified research from Phase 1, write a complete, engaging video script for: {user_query}.\n\nScript Requirements:\n- Target Duration: 2-3 minutes\n- Tone: Enthusiastic, crystal-clear, and structured\n- Include: Timestamps, Narration Dialogue, and [Visual Directions for animators]\n\nContext to reference:\n\"\"\"\n[Insert approved Phase 1 research summary here]\n\"\"\""
                    )
                ]
            ))

            # 2. Midjourney (Phase 3)
            midjourney_tool = next((t for t in self.catalog if "midjourney" in t["name"].lower()), self.catalog[5])
            recommendations.append(ToolRecommendation(
                category="Visual Storyboarding & Art",
                tool_name=midjourney_tool["name"],
                provider=midjourney_tool["provider"],
                description=midjourney_tool["description"],
                why_recommended="Industry benchmark for stylized character design, visual consistency, and cinematic storyboard frames.",
                sample_prompt=f"Create vibrant, high-fidelity storyboard visual frames for: {user_query}.",
                is_free=midjourney_tool.get("is_free", False),
                pricing_tier=midjourney_tool.get("pricing_tier", "Paid"),
                assigned_phases=[3],
                phase_prompts=[
                    PhasePrompt(
                        phase=3,
                        phase_title="Phase 3: Visual Storyboarding & Art",
                        prompt=f"/imagine prompt: Vibrant 3D animated visual frame for an educational video about {user_query}, scene key visual, highly detailed, Pixar animation aesthetic, bright cinematic lighting, volumetric atmosphere, 8k resolution, 16:9 aspect ratio --ar 16:9 --v 6.1\n\nSpecific scene detail:\n\"\"\"\n[Insert scene visual description from Phase 2 script here]\n\"\"\""
                    )
                ]
            ))

            # 3. ElevenLabs (Phase 4)
            eleven_tool = next((t for t in self.catalog if "elevenlabs" in t["name"].lower()), self.catalog[8])
            recommendations.append(ToolRecommendation(
                category="Voiceover & Speech Synthesis",
                tool_name=eleven_tool["name"],
                provider=eleven_tool["provider"],
                description=eleven_tool["description"],
                why_recommended="Hyper-realistic voice synthesis with natural human cadence, emotional inflections, and pacing control.",
                sample_prompt=f"Generate voiceover audio for {user_query} using verified Phase 2 script.",
                is_free=eleven_tool.get("is_free", True),
                pricing_tier=eleven_tool.get("pricing_tier", "Freemium"),
                assigned_phases=[4],
                phase_prompts=[
                    PhasePrompt(
                        phase=4,
                        phase_title="Phase 4: Voiceover Narration",
                        prompt=f"Voiceover Narration Directives for: {user_query}\nVoice Profile: Warm, clear, and engaging educational narrator.\nPacing: 140 WPM, natural breathing pauses at section transitions.\n\nScript to speak:\n\"\"\"\n[Insert complete narration script from Phase 2 here]\n\"\"\""
                    )
                ]
            ))

            # 4. Runway Gen-3 (Phase 5)
            runway_tool = next((t for t in self.catalog if "runway" in t["name"].lower()), self.catalog[7])
            recommendations.append(ToolRecommendation(
                category="Video & Motion Synthesis",
                tool_name=runway_tool["name"],
                provider=runway_tool["provider"],
                description=runway_tool["description"],
                why_recommended="Cinematic video synthesis with camera control and seamless motion dynamics.",
                sample_prompt=f"Generate animated motion clips for {user_query}.",
                is_free=runway_tool.get("is_free", False),
                pricing_tier=runway_tool.get("pricing_tier", "Freemium"),
                assigned_phases=[5],
                phase_prompts=[
                    PhasePrompt(
                        phase=5,
                        phase_title="Phase 5: Video Motion Synthesis",
                        prompt=f"Motion Prompt: Fluid, dynamic cinematic camera movement showing {user_query}. Smooth animated motion, bright natural lighting, 4K quality.\nInput Image Reference: [Upload Phase 3 storyboard image frame]\nCamera Motion: Slow pan forward, subtle rotation."
                    )
                ]
            ))

            # 5. Suno AI (Phase 6)
            suno_tool = next((t for t in self.catalog if "suno" in t["name"].lower()), self.catalog[-1])
            recommendations.append(ToolRecommendation(
                category="Audio & Music Composition",
                tool_name=suno_tool["name"],
                provider=suno_tool["provider"],
                description=suno_tool["description"],
                why_recommended="Generative audio music engine tailored for uplifting, high-fidelity background scores.",
                sample_prompt=f"Generate uplifting educational background music for {user_query}.",
                is_free=suno_tool.get("is_free", True),
                pricing_tier=suno_tool.get("pricing_tier", "Freemium"),
                assigned_phases=[6],
                phase_prompts=[
                    PhasePrompt(
                        phase=6,
                        phase_title="Phase 6: Background Score Composition",
                        prompt=f"Instrumental acoustic and light electronic background score, cheerful, curious, and uplifting melody suitable for educational content about {user_query}. Gentle tempo, subtle bass, no vocals."
                    )
                ]
            ))

        elif is_code:
            decomposition = [
                "Phase 1: Architectural Design & Schema Modeling",
                "Phase 2: Core Algorithm & Business Logic Implementation",
                "Phase 3: Formal Verification & Edge-Case Testing",
                "Phase 4: Full-Stack Codebase Integration & Packaging"
            ]

            # Claude 3.5 Sonnet (Phase 1 & 2)
            claude_tool = self.catalog[0]
            recommendations.append(ToolRecommendation(
                category="Architecture & Software Engineering",
                tool_name=claude_tool["name"],
                provider=claude_tool["provider"],
                description=claude_tool["description"],
                why_recommended="Leading benchmark scores in software architecture, system decomposition, and type-safe clean code.",
                sample_prompt=f"Design and implement software architecture for: {user_query}.",
                is_free=False,
                pricing_tier=claude_tool["pricing_tier"],
                assigned_phases=[1, 2],
                phase_prompts=[
                    PhasePrompt(
                        phase=1,
                        phase_title="Phase 1: Architectural Design & Schema",
                        prompt=f"Act as a Principal Software Architect. For '{user_query}', formulate a clean, modular architecture:\n1. Core domain entities and data models (Pydantic / TypeScript interfaces).\n2. API endpoint specifications and state flow.\n3. Error handling boundaries and resilience strategy."
                    ),
                    PhasePrompt(
                        phase=2,
                        phase_title="Phase 2: Core Implementation",
                        prompt=f"Using the architectural schema from Phase 1, write the production-grade implementation for: {user_query}.\n\nRequirements:\n- Full typed implementation with zero placeholders\n- Comprehensive docstrings and inline comments\n- Defensive input validation\n\nSchema to implement:\n\"\"\"\n[Insert Phase 1 schemas here]\n\"\"\""
                    )
                ]
            ))

            # DeepSeek-R1 (Phase 3)
            deepseek_tool = next((t for t in self.catalog if "deepseek" in t["name"].lower()), self.catalog[3])
            recommendations.append(ToolRecommendation(
                category="Formal Verification & Reasoning",
                tool_name=deepseek_tool["name"],
                provider=deepseek_tool["provider"],
                description=deepseek_tool["description"],
                why_recommended="State-of-the-art chain-of-thought mathematical reasoning for auditing complex edge cases and invariant verification.",
                sample_prompt=f"Verify algorithmic correctness and edge cases for {user_query}.",
                is_free=True,
                pricing_tier=deepseek_tool["pricing_tier"],
                assigned_phases=[3],
                phase_prompts=[
                    PhasePrompt(
                        phase=3,
                        phase_title="Phase 3: Formal Edge-Case Verification",
                        prompt=f"Perform a rigorous mathematical and logical audit on the implementation for: {user_query}.\n\nIdentify:\n1. Concurrency race conditions or off-by-one errors\n2. Algorithmic complexity bottlenecks (Time & Space)\n3. Provable invariants\n\nCode to audit:\n\"\"\"\n[Insert Phase 2 implementation code here]\n\"\"\""
                    )
                ]
            ))

            # Cursor AI IDE (Phase 4)
            cursor_tool = next((t for t in self.catalog if "cursor" in t["name"].lower()), self.catalog[1])
            recommendations.append(ToolRecommendation(
                category="Codebase Integration & Tooling",
                tool_name=cursor_tool["name"],
                provider=cursor_tool["provider"],
                description=cursor_tool["description"],
                why_recommended="Codebase-wide semantic indexing and multi-file editing to wire components directly into your repository.",
                sample_prompt=f"Integrate {user_query} across repository files.",
                is_free=False,
                pricing_tier=cursor_tool["pricing_tier"],
                assigned_phases=[4],
                phase_prompts=[
                    PhasePrompt(
                        phase=4,
                        phase_title="Phase 4: Full-Stack Codebase Integration",
                        prompt=f"In Cursor Composer (Ctrl+I):\nIndex the repository and integrate the verified code for {user_query}.\n1. Create corresponding unit and integration tests under /tests\n2. Update package export entry points\n3. Ensure build and lint passes cleanly."
                    )
                ]
            ))

        else:
            # General / Data / Business workflow
            decomposition = [
                "Phase 1: Objective Framing & Structured Data Research",
                "Phase 2: Core Analytical & Synthesis Modeling",
                "Phase 3: Visual Reporting & Presentation Assets"
            ]

            # Gemini 2.0 Flash (Phase 1 & 2)
            gemini_tool = next((t for t in self.catalog if "gemini" in t["name"].lower()), self.catalog[0])
            recommendations.append(ToolRecommendation(
                category="Research & Data Synthesis",
                tool_name=gemini_tool["name"],
                provider=gemini_tool["provider"],
                description=gemini_tool["description"],
                why_recommended="High-context multimodal engine capable of parsing complex datasets and formulating synthesized executive insights.",
                sample_prompt=f"Research and analyze: {user_query}.",
                is_free=True,
                pricing_tier=gemini_tool["pricing_tier"],
                assigned_phases=[1, 2],
                phase_prompts=[
                    PhasePrompt(
                        phase=1,
                        phase_title="Phase 1: Objective Framing & Data Research",
                        prompt=f"Act as a Senior Research Analyst. For '{user_query}', construct a structured investigation matrix:\n1. Identify primary metrics and benchmarks\n2. Outline data requirements and hypotheses\n3. Provide industry reference baselines."
                    ),
                    PhasePrompt(
                        phase=2,
                        phase_title="Phase 2: Analytical Modeling & Synthesis",
                        prompt=f"Using the findings from Phase 1, synthesize concrete strategic recommendations for: {user_query}.\n\nProvide:\n- Quantitative takeaways and projected impact\n- Step-by-step operational roadmap\n- Risk mitigation tactics\n\nData to synthesize:\n\"\"\"\n[Insert Phase 1 data and findings here]\n\"\"\""
                    )
                ]
            ))

            # Ideogram 2.0 (Phase 3)
            ideogram_tool = next((t for t in self.catalog if "ideogram" in t["name"].lower()), self.catalog[6])
            recommendations.append(ToolRecommendation(
                category="Visual Presentation & Graphic Design",
                tool_name=ideogram_tool["name"],
                provider=ideogram_tool["provider"],
                description=ideogram_tool["description"],
                why_recommended="Specialist in typographic graphic design, executive summary infographics, and clean typography.",
                sample_prompt=f"Generate executive graphic asset for {user_query}.",
                is_free=True,
                pricing_tier=ideogram_tool["pricing_tier"],
                assigned_phases=[3],
                phase_prompts=[
                    PhasePrompt(
                        phase=3,
                        phase_title="Phase 3: Visual Presentation & Infographics",
                        prompt=f"Clean, modern minimalist executive summary infographic poster about '{user_query}'. Crisp readable typography, dark mode aesthetic, vibrant accent charts, professional corporate design, 8k resolution."
                    )
                ]
            ))

        # Generate blueprints matching recommendations
        for idx, rec in enumerate(recommendations):
            diy_blueprint.append({
                "step": idx + 1,
                "action": f"Deploy {rec.tool_name} for Phase {', '.join(map(str, rec.assigned_phases))}",
                "recommended_tool": rec.tool_name,
                "instruction": f"Run the tailored prompt in {rec.tool_name} ({rec.provider}) and carry the generated output forward.",
                "expected_output": f"Verified deliverables for Phase {', '.join(map(str, rec.assigned_phases))}"
            })

        is_smart_mode = delivery_mode in ["smart", "overdeliver"]
        anticipated_blind_spots = self._generate_default_blind_spots(user_query) if is_smart_mode else []
        complimentary_starter_pack = self._generate_default_starter_pack(user_query) if is_smart_mode else {}

        return AdvisorResponse(
            original_query=user_query,
            task_decomposition=decomposition,
            recommendations=recommendations,
            diy_execution_blueprint=diy_blueprint,
            delivery_mode="smart" if is_smart_mode else "strict",
            anticipated_blind_spots=anticipated_blind_spots,
            complimentary_starter_pack=complimentary_starter_pack
        )

advisor_engine = AIAdvisorEngine()
