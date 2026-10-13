"""
Persistent Memory Engine: Autonomous Persistent Cross-Chat Memory Manager for OmniTask AI.

Dedicated memory space common to ALL chats and unique to each user.
Self-updating, enduring memory that selectively preserves:
- User business, role, store, and identity facts (e.g., "User owns a cosmetic shop")
- Enduring negative constraints and preferences (e.g., "Never structure campaigns day-wise")
- Key domain entities, product lines, and persistent brand directives

STRICTLY FILTERS OUT:
- Ephemeral execution requests (e.g., "make a creative bangle image", "draw a flower")
- One-off transient questions and temporary prompts

Consolidates automatically from previous chats the moment a new chat begins,
and injects the resulting memory as the first-class grounding context into new chats.
"""

import json
import time
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
import httpx

from app.config import config
from app.models.schemas import ChatSession, ChatMessage

class PersistentMemoryManager:
    """
    Autonomous Cross-Chat Persistent Memory Manager.
    Maintains a dedicated, persistent JSON profile per user in uploads/memory/.
    """
    def __init__(self, memory_dir: Optional[Path] = None):
        if not memory_dir:
            self.memory_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "memory"
        else:
            self.memory_dir = memory_dir
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.gemini_key = config.GEMINI_API_KEY
        self.groq_key = config.GROQ_API_KEY

    def _get_memory_file(self, user_id: str = "default_user") -> Path:
        safe_user_id = re.sub(r'[^a-zA-Z0-9_-]', '_', user_id or "default_user")
        return self.memory_dir / f"{safe_user_id}_persistent_memory.json"

    def get_user_memory(self, user_id: str = "default_user") -> Dict[str, Any]:
        """Loads the dedicated persistent memory for the specified user."""
        file_path = self._get_memory_file(user_id)
        if not file_path.exists():
            return {
                "user_id": user_id,
                "created_at": time.time(),
                "updated_at": time.time(),
                "identity_and_business": [],
                "persistent_rules_and_preferences": [],
                "domain_entities_and_topics": [],
                "facts": []
            }
        try:
            return json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[PersistentMemory] Error reading memory for {user_id}: {e}")
            return {
                "user_id": user_id,
                "created_at": time.time(),
                "updated_at": time.time(),
                "identity_and_business": [],
                "persistent_rules_and_preferences": [],
                "domain_entities_and_topics": [],
                "facts": []
            }

    def save_user_memory(self, user_id: str, memory_data: Dict[str, Any]):
        """Persists the user's persistent memory to disk."""
        file_path = self._get_memory_file(user_id)
        memory_data["updated_at"] = time.time()
        try:
            file_path.write_text(json.dumps(memory_data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            print(f"[PersistentMemory] Error saving memory for {user_id}: {e}")

    def clear_user_memory(self, user_id: str = "default_user") -> bool:
        """Resets the user's persistent memory."""
        file_path = self._get_memory_file(user_id)
        if file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as e:
                print(f"[PersistentMemory] Error deleting memory file: {e}")
                return False
        return True

    def has_memory(self, user_id: str = "default_user") -> bool:
        """Returns True if the user has stored persistent memory facts."""
        mem = self.get_user_memory(user_id)
        return bool(
            mem.get("identity_and_business") or
            mem.get("persistent_rules_and_preferences") or
            mem.get("domain_entities_and_topics")
        )

    def format_memory_for_prompt(self, user_id: str = "default_user") -> str:
        """
        Renders the active persistent memory as an authoritative directive block
        to be injected as the first thing into new chats.
        """
        mem = self.get_user_memory(user_id)
        identity = mem.get("identity_and_business", [])
        rules = mem.get("persistent_rules_and_preferences", [])
        domain_items = mem.get("domain_entities_and_topics", [])

        if not identity and not rules and not domain_items:
            return ""

        blocks = []
        if identity:
            blocks.append("• USER BUSINESS & IDENTITY PROFILE:\n" + "\n".join([f"  - {item}" for item in identity]))
        if rules:
            blocks.append("• USER PERSISTENT PREFERENCES & OPERATIONAL RULES:\n" + "\n".join([f"  - {rule}" for rule in rules]))
        if domain_items:
            blocks.append("• CORE DOMAIN CONTEXT & PROJECT ROOTS:\n" + "\n".join([f"  - {d}" for d in domain_items]))

        body = "\n\n".join(blocks)
        return (
            "======================================================================\n"
            "[USER GLOBAL PERSISTENT MEMORY & IDENTITY]\n"
            "The system automatically retrieved the following verified facts across past chats.\n"
            "MANDATORY CONTINUITY DIRECTIVE: You MUST automatically ground all recommendations, plans,\n"
            "creative ideas, scripts, and deliverables to naturally align with this user context without\n"
            "asking them to re-explain who they are or what their business does:\n\n"
            f"{body}\n"
            "======================================================================"
        )

    # ------------------------------------------------------------------
    # INTELLIGENT FILTERING & EXTRACTION
    # ------------------------------------------------------------------
    def is_ephemeral_request(self, text: str) -> bool:
        """
        Detects whether an instruction is merely a transient, one-off execution command
        (such as 'make a creative bangle image') that should NOT be added to global memory.
        """
        t = text.lower().strip()
        # Ephemeral creative generation commands
        ephemeral_patterns = [
            r'^(?:make|create|draw|render|generate|give me|write|show me)\s+(?:an?|the|some)?\s*(?:creative\s+|beautiful\s+|nice\s+)?(?:image|picture|photo|sketch|illustration|drawing|bangle|poster|clip|video|gif|wallpaper)\b',
            r'^(?:write|compose|generate)\s+(?:a\s+)?(?:poem|haiku|rhyme|song|lyrics|joke|story|tweet)\b',
            r'^(?:solve|calculate|compute)\s+\d+',
            r'^(?:can you\s+)?(?:make|draw|generate)\s+(?:a\s+|an\s+)?(?:bangle|flower|car|dog|cat|portrait|scenery)\b',
        ]
        for pat in ephemeral_patterns:
            if re.search(pat, t):
                # Unless it explicitly states persistent identity (e.g. "I have a cosmetic shop and make a bangle image")
                if not any(k in t for k in ["i have", "i own", "my shop", "my business", "we are", "i am a"]):
                    return True
        return False

    def extract_heuristics(self, text: str) -> Dict[str, List[str]]:
        """
        Fast, zero-latency heuristic extractor detecting identity, business facts,
        and persistent constraints from natural language turns.
        """
        extracted = {
            "identity_and_business": [],
            "persistent_rules_and_preferences": [],
            "domain_entities_and_topics": []
        }

        # Normalize text into sentences
        sentences = re.split(r'[,.\n;?!]+', text)
        for s in sentences:
            s_clean = s.strip()
            if len(s_clean) < 8 or self.is_ephemeral_request(s_clean):
                continue
            s_lower = s_clean.lower()

            # 1. Identity & Business Statements
            # e.g., "I have a cosmetic shop", "I own a bakery", "We run an edtech brand"
            m_have = re.search(r'\b(?:i\s+have|i\s+own|i\s+run|we\s+have|we\s+run|we\s+own)\s+(?:a|an)?\s*([a-zA-Z0-9\s_-]+(?:shop|store|boutique|business|startup|agency|channel|company|brand|clinic|restaurant|cafe|saloon|parlor|parlour|studio|firm|school|academy))', s_lower)
            if m_have:
                biz_name = m_have.group(0).strip().capitalize()
                extracted["identity_and_business"].append(f"User profile: {biz_name}.")
                continue

            m_am = re.search(r'\b(?:i\s+am|i\'m|we\s+are)\s+(?:a|an)?\s*([a-zA-Z0-9\s_-]+(?:teacher|creator|influencer|founder|developer|engineer|designer|doctor|author|student|marketer|consultant|trader|merchant))', s_lower)
            if m_am:
                role = m_am.group(0).strip().capitalize()
                extracted["identity_and_business"].append(f"User role: {role}.")
                continue

            m_my_biz = re.search(r'\b(?:my|our)\s+(?:shop|store|business|brand|company|channel|product)\s+(?:is|deals in|sells|focuses on)\s+([a-zA-Z0-9\s_-]+)', s_lower)
            if m_my_biz:
                extracted["identity_and_business"].append(f"{s_clean.capitalize()}.")
                continue

            # 2. Persistent Negative Constraints & Rules
            # e.g., "don't give me day wise but diff topics", "never use artificial colors", "always format as themes"
            if any(k in s_lower for k in [
                "not day wise", "not day-wise", "not daily", "not day by day",
                "dont give me any script", "don't give me any script",
                "no astrology", "no stone", "without any day", "not some attire"
            ]):
                extracted["persistent_rules_and_preferences"].append(f"Constraint: {s_clean.capitalize()}.")
                continue

            if any(k in s_lower for k in ["always organize", "always format", "never include", "never use", "dont ever", "don't ever", "strictly avoid"]):
                if not self.is_ephemeral_request(s_clean):
                    extracted["persistent_rules_and_preferences"].append(f"Rule: {s_clean.capitalize()}.")
                    continue

        return extracted

    async def _extract_with_llm(self, chat_transcript: str) -> Optional[Dict[str, List[str]]]:
        """
        Uses live LLM (Gemini / Groq) to synthesize high-confidence identity facts
        and persistent user preferences while strictly filtering out transient commands.
        """
        system_instruction = (
            "You are the Persistent Memory Consolidation Agent for OmniTask AI.\n"
            "Your job is to read conversation history between a User and an AI assistant, "
            "and extract ONLY durable, important, persistent facts about the user and their business.\n\n"
            "STRICT EXTRACTION GUIDELINES:\n"
            "1. WHAT TO EXTRACT:\n"
            "   - User Identity / Profession / Business Ownership: (e.g., 'User owns a cosmetic shop', 'User is a Python educator', 'Brand name is VelvetGlow').\n"
            "   - Enduring Constraints & Preferences: (e.g., 'Prefers campaign ideas organized by creative themes rather than day-wise schedules', 'Never reveal puzzle answers in text').\n"
            "   - Core Domain / Business Offering: (e.g., 'Sells cosmetics and beauty products', 'Publishes AI tutorials for college students').\n\n"
            "2. WHAT TO STRICTLY IGNORE (NEVER EXTRACT):\n"
            "   - Ephemeral, one-off execution tasks (e.g., 'make a creative bangle image', 'write a 4-line poem', 'render a 3D ball', 'solve 45+90').\n"
            "   - Temporary edits or momentary questions.\n\n"
            "Return valid JSON matching this exact structure:\n"
            "{\n"
            '  "identity_and_business": ["..."],\n'
            '  "persistent_rules_and_preferences": ["..."],\n'
            '  "domain_entities_and_topics": ["..."]\n'
            "}\n"
            "If no durable user facts are found in the text, return empty lists."
        )

        user_content = f"Transcript to analyze for durable user profile and preferences:\n\n{chat_transcript[:25000]}"

        # 1. Try Groq (blazing fast: ~0.8s)
        if self.groq_key:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.groq_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": "openai/gpt-oss-120b",
                            "messages": [
                                {"role": "system", "content": system_instruction},
                                {"role": "user", "content": user_content}
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.1
                        }
                    )
                    if resp.status_code == 200:
                        content = resp.json()["choices"][0]["message"]["content"]
                        data = json.loads(content)
                        if isinstance(data, dict):
                            return data
            except Exception as e:
                print(f"[PersistentMemory] Groq extraction note: {e}. Trying Gemini fallback.")

        # 2. Try Gemini Fallback
        if self.gemini_key:
            for c_model in ["gemini-3.8-flash", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"]:
                try:
                    async with httpx.AsyncClient(timeout=4.0) as client:
                        resp = await client.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/{c_model}:generateContent?key={self.gemini_key}",
                            json={
                                "contents": [{"parts": [{"text": f"{system_instruction}\n\n{user_content}"}]}],
                                "generationConfig": {"response_mime_type": "application/json"}
                            }
                        )
                        if resp.status_code == 200:
                            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                            data = json.loads(raw)
                            if isinstance(data, dict):
                                return data
                except Exception:
                    continue

        return None

    def _normalize_fact(self, fact: str) -> str:
        """Normalizes a fact string for clean deduplication."""
        f = fact.strip().strip("-*• ")
        f = re.sub(r'^(?:user\s+profile:\s*|user\s+role:\s*|constraint:\s*|rule:\s*)', '', f, flags=re.IGNORECASE).strip()
        f = re.sub(r'\s+', ' ', f)
        return f

    def _merge_facts(self, existing_list: List[str], new_candidates: List[str]) -> List[str]:
        """Merges new facts into existing facts without duplicates."""
        merged = list(existing_list)
        existing_normalized = {self._normalize_fact(item).lower() for item in existing_list}

        for cand in new_candidates:
            if not cand or len(cand.strip()) < 5:
                continue
            cand_clean = cand.strip().strip("-*• ")
            # Filter out accidental ephemeral insertions
            if self.is_ephemeral_request(cand_clean):
                continue
            norm = self._normalize_fact(cand_clean).lower()
            if norm not in existing_normalized:
                merged.append(cand_clean)
                existing_normalized.add(norm)

        return merged

    async def consolidate_from_all_chats(
        self,
        user_id: str = "default_user",
        chat_sessions: Optional[List[ChatSession]] = None
    ) -> Dict[str, Any]:
        """
        Scans all previous chat sessions of the user, extracts persistent identity
        and operational facts, filters out ephemeral commands, and merges into persistent memory.
        """
        current_memory = self.get_user_memory(user_id)
        if not chat_sessions:
            from app.core.chat_manager import chat_manager
            # Load all sessions
            sessions = []
            for meta in chat_manager.list_chats():
                sess = chat_manager.get_chat(meta.id)
                if sess and sess.messages:
                    sessions.append(sess)
            chat_sessions = sessions

        if not chat_sessions:
            return current_memory

        # Build transcript of all user communications across past chats
        transcript_lines = []
        for sess in chat_sessions:
            transcript_lines.append(f"\n--- SESSION: {sess.title} (ID: {sess.id}) ---")
            for m in sess.messages:
                prefix = "User" if m.role == "user" else "Assistant"
                # For assistant messages, include first 200 chars summary
                text_slice = m.content if m.role == "user" else (m.content[:200] + "...")
                transcript_lines.append(f"{prefix}: {text_slice}")

        full_transcript = "\n".join(transcript_lines)

        # 1. Extract using Heuristics (instant guarantee)
        heuristic_results = self.extract_heuristics(full_transcript)

        # 2. Extract using LLM intelligence if available
        llm_results = await self._extract_with_llm(full_transcript)
        combined_results = {
            "identity_and_business": list(heuristic_results.get("identity_and_business", [])),
            "persistent_rules_and_preferences": list(heuristic_results.get("persistent_rules_and_preferences", [])),
            "domain_entities_and_topics": list(heuristic_results.get("domain_entities_and_topics", []))
        }

        if llm_results and isinstance(llm_results, dict):
            for k in ["identity_and_business", "persistent_rules_and_preferences", "domain_entities_and_topics"]:
                if isinstance(llm_results.get(k), list):
                    combined_results[k].extend(llm_results[k])

        # Merge with current memory
        current_memory["identity_and_business"] = self._merge_facts(
            current_memory.get("identity_and_business", []),
            combined_results["identity_and_business"]
        )
        current_memory["persistent_rules_and_preferences"] = self._merge_facts(
            current_memory.get("persistent_rules_and_preferences", []),
            combined_results["persistent_rules_and_preferences"]
        )
        current_memory["domain_entities_and_topics"] = self._merge_facts(
            current_memory.get("domain_entities_and_topics", []),
            combined_results["domain_entities_and_topics"]
        )

        self.save_user_memory(user_id, current_memory)
        return current_memory

    def inspect_and_update_from_message(
        self,
        user_id: str,
        user_prompt: str,
        assistant_response: str = "",
        chat_id: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Fast incremental inspection after a message turn.
        If user explicitly reveals identity/business or a permanent rule,
        immediately registers it into Persistent Memory.
        """
        if self.is_ephemeral_request(user_prompt):
            return None

        heuristics = self.extract_heuristics(user_prompt)
        has_new = any(heuristics.values())
        if not has_new:
            return None

        mem = self.get_user_memory(user_id)
        changed = False

        for k in ["identity_and_business", "persistent_rules_and_preferences", "domain_entities_and_topics"]:
            if heuristics.get(k):
                prev_len = len(mem.get(k, []))
                mem[k] = self._merge_facts(mem.get(k, []), heuristics[k])
                if len(mem[k]) > prev_len:
                    changed = True

        if changed:
            self.save_user_memory(user_id, mem)
            return mem
        return None

persistent_memory = PersistentMemoryManager()
