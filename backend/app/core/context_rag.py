import re
import math
from typing import List, Dict, Any, Optional, Set, Tuple
from app.models.schemas import ChatSession, ChatMessage

class ChatChunk:
    """Represents a discrete semantic chunk of a past chat message or deliverable."""
    def __init__(
        self,
        turn_index: int,
        role: str,
        heading: str,
        content: str,
        message_id: str = ""
    ):
        self.turn_index = turn_index
        self.role = role
        self.heading = heading
        self.content = content.strip()
        self.message_id = message_id
        self.tokens_estimate = max(1, len(self.content.split()))
        self.keywords = self._extract_keywords(f"{heading} {self.content}")

    def _extract_keywords(self, text: str) -> Set[str]:
        cleaned = re.sub(r'[^a-zA-Z0-9\s_-]', ' ', text.lower())
        words = cleaned.split()
        stopwords = {
            'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
            'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
            'into', 'through', 'during', 'before', 'after', 'above', 'below',
            'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
            'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
            'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such',
            'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
            'can', 'will', 'just', 'should', 'now', 'please', 'make', 'give', 'tell'
        }
        return {w for w in words if len(w) > 2 and w not in stopwords}

class ChatContextRAG:
    """
    Intelligent Context Preservation & RAG Engine for Multi-Turn Swarm Chats.
    
    Responsibilities:
    1. Full Deliverable Retention: Keeps complete preceding deliverables for active turns.
    2. Context Compression: Compresses older historical turns when chats grow beyond a threshold.
    3. Chat Storage RAG: Semantic & lexical index over the entire chat history that retrieves
       exact excerpts when a user references prior outputs, specific points, or past decisions.
    """
    def __init__(self, session: ChatSession):
        self.session = session
        self.chunks: List[ChatChunk] = []
        self._index_all_messages()

    @staticmethod
    def _stem_word(w: str) -> str:
        """Normalizes plural and verbal suffixes for robust cross-turn semantic matching."""
        w = w.lower()
        for suffix in ["ies", "es", "s", "ing", "ed"]:
            if w.endswith(suffix) and len(w) > len(suffix) + 2:
                return w[:-len(suffix)]
        return w

    def _index_all_messages(self):
        """Indexes all user messages and assistant deliverables into searchable chunks."""
        messages = self.session.messages or []
        # Exclude active prompt from indexed history
        prior_messages = messages[:-1] if (messages and messages[-1].role == "user") else messages
        for idx, msg in enumerate(prior_messages):
            turn_num = idx + 1
            content = msg.content or ""
            if not content.strip():
                continue

            # If message is short (< 300 chars), treat as single chunk
            if len(content) < 300:
                self.chunks.append(ChatChunk(
                    turn_index=turn_num,
                    role=msg.role,
                    heading=f"Turn {turn_num} ({msg.role.title()})",
                    content=content,
                    message_id=msg.id
                ))
                continue

            # For longer messages (especially deliverables), chunk by Markdown headers or numbered items
            sections = re.split(r'\n(?=#{1,4}\s+)', content)
            if len(sections) > 1:
                for sec in sections:
                    sec_clean = sec.strip()
                    if not sec_clean:
                        continue
                    m_head = re.match(r'^#{1,4}\s+(.+)', sec_clean)
                    head_title = m_head.group(1).strip() if m_head else f"Turn {turn_num} Section"
                    
                    # If a section itself is very large (> 1500 chars), further chunk by list items
                    if len(sec_clean) > 1500:
                        sub_items = re.split(r'\n(?=(?:[-*]|\d+[\.\)])\s+)', sec_clean)
                        if len(sub_items) > 1:
                            for sub in sub_items:
                                sub_s = sub.strip()
                                if len(sub_s) > 20:
                                    self.chunks.append(ChatChunk(
                                        turn_index=turn_num,
                                        role=msg.role,
                                        heading=head_title,
                                        content=sub_s,
                                        message_id=msg.id
                                    ))
                            continue

                    self.chunks.append(ChatChunk(
                        turn_index=turn_num,
                        role=msg.role,
                        heading=head_title,
                        content=sec_clean,
                        message_id=msg.id
                    ))
            else:
                # Chunk by paragraphs or numbered items
                paragraphs = re.split(r'\n\s*\n+', content)
                for p_idx, p in enumerate(paragraphs):
                    p_clean = p.strip()
                    if len(p_clean) > 30:
                        self.chunks.append(ChatChunk(
                            turn_index=turn_num,
                            role=msg.role,
                            heading=f"Turn {turn_num} (Part {p_idx + 1})",
                            content=p_clean,
                            message_id=msg.id
                        ))

    def retrieve_relevant_chunks(self, query: str, top_k: int = 4) -> List[Tuple[ChatChunk, float]]:
        """
        RAG Retrieval: Scores all chunks in the entire chat history against the user's query
        using TF-IDF keyword overlap + entity matching + header boosting.
        """
        if not query or not query.strip() or not self.chunks:
            return []

        cleaned_query = re.sub(r'[^a-zA-Z0-9\s_-]', ' ', query.lower())
        query_words = [w for w in cleaned_query.split() if len(w) > 2]
        if not query_words:
            return []

        # Find specific references like numbers (e.g. 'topic 3', 'point 2', 'question 4', 'section 1', 'module 2')
        specific_refs = re.findall(r'\b(?:topic|point|question|theme|part|item|step|option|q|section|module|pillar|recipe|slide|rule|case|idea)\s*(\d+)\b', query.lower())
        named_entities = [w for w in query_words if len(w) > 4]

        scored_chunks: List[Tuple[ChatChunk, float]] = []

        for chunk in self.chunks:
            score = 0.0
            chunk_text_lower = chunk.content.lower()
            chunk_heading_lower = chunk.heading.lower()

            # 1. Keyword overlap
            matching_keywords = chunk.keywords.intersection(set(query_words))
            score += len(matching_keywords) * 2.5

            # 2. Header match bonus
            for qw in query_words:
                if qw in chunk_heading_lower:
                    score += 4.0

            # 3. Specific reference bonus (e.g. 'topic 3' or 'question 2')
            for ref_num in specific_refs:
                pat = rf'\b(?:topic|point|question|theme|part|item|step|option|q)?\s*{ref_num}\b'
                if re.search(pat, chunk_heading_lower):
                    score += 8.0
                elif re.search(pat, chunk_text_lower):
                    score += 5.0

            # 4. Exact phrase matching bonus
            for qw in named_entities:
                if qw in chunk_text_lower:
                    score += 2.0

            # 5. Favor assistant deliverables for output modification queries
            if chunk.role == "assistant" and any(m in query.lower() for m in ["change", "modify", "update", "replace", "revise", "in ", "expand", "remove", "add"]):
                score *= 1.3

            # 6. Recency Boost: Higher turn indices are much more likely to be the active context
            max_turn = max((c.turn_index for c in self.chunks), default=1)
            recency_ratio = chunk.turn_index / max(1, max_turn)
            score += recency_ratio * 5.0

            if score > 1.5:
                scored_chunks.append((chunk, score))

        # Sort by score descending
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        return scored_chunks[:top_k]

    def resolve_targeted_deliverable(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Backward-Traversing Turn Matcher with Dynamic Contrast Amplification.
        
        When a user directive references prior work (e.g. 'add ___ in this', 'change X', 'why did you...'),
        evaluates candidate assistant deliverables in reverse chronological order (T-1 down to T-N).
        
        If raw confidence scores between candidate turns are close, applies Dynamic Contrast Amplification
        (the mathematical inverse of min-max / z-score compression) to magnify minute differences into
        decisive separation, preventing ambiguity and ensuring the right deliverable is anchored.
        """
        messages = self.session.messages or []
        prior_messages = messages[:-1] if (messages and messages[-1].role == "user") else messages
        
        # Collect candidate assistant deliverables with non-empty content
        candidate_deliverables = []
        for idx, m in enumerate(prior_messages):
            if m.role == "assistant" and m.content and len(m.content.strip()) > 40:
                candidate_deliverables.append({
                    "turn_index": idx + 1,
                    "content": m.content.strip(),
                    "message_id": m.id,
                    "tokens_estimate": len(m.content.split())
                })
        
        if not candidate_deliverables:
            return None

        # Clean query words and extract structural cues
        q_clean = re.sub(r'[^a-zA-Z0-9\s_-]', ' ', query.lower())
        q_words = set(w for w in q_clean.split() if len(w) > 2)
        q_lower = query.lower()
        
        # Check for specific numbered references (e.g. 'topic 3', 'point 2', 'question 4', 'q3')
        specific_refs = re.findall(r'\b(?:topic|point|question|theme|part|item|step|option|q|section|module|pillar|recipe|slide|rule|case|idea)\s*(\d+)\b', q_lower)
        
        # Structural domain cues to verify if candidate deliverable matches the requested entity
        structural_keywords = {
            "table": ["|", "<table>", "column", "row", "table"],
            "quiz": ["quiz", "test", "question", "mcq", "option a", "option b", "answer key"],
            "code": ["```", "def ", "class ", "import ", "function", "script", "api"],
            "recipe": ["recipe", "ingredient", "tablespoon", "teaspoon", "cook", "dish"],
            "video_topic": ["topic", "pillar", "video", "series", "concept", "theme", "title"],
            "math": ["equation", "formula", "derivation", "calculate", "bound", "theorem"],
            "document": ["pdf", "docx", "word", "document", "report"]
        }
        
        detected_structural_cues = []
        for cat, triggers in structural_keywords.items():
            if any(t in q_lower for t in triggers):
                detected_structural_cues.append(cat)
                
        # Traverse candidates backward from most recent (T-1) to oldest
        reversed_candidates = list(reversed(candidate_deliverables))
        scored_candidates = []
        
        # Informative query keywords (excluding generic command words like 'add', 'make', 'this')
        stopwords = {"add", "make", "give", "tell", "this", "that", "more", "some", "with", "from", "into", "the", "please", "can", "you", "also"}
        informative_q_words = [w for w in q_words if w not in stopwords]
        if not informative_q_words:
            informative_q_words = list(q_words)

        for dist, cand in enumerate(reversed_candidates):
            content_lower = cand["content"].lower()
            cand_tokens = set(re.sub(r'[^a-zA-Z0-9\s_-]', ' ', content_lower).split())
            cand_stems = set(self._stem_word(t) for t in cand_tokens)
            
            # 1. Stem-Aware Lexical Overlap
            matched_words = 0
            for qw in informative_q_words:
                qw_stem = self._stem_word(qw)
                if qw in cand_tokens or qw_stem in cand_stems or qw_stem in content_lower:
                    matched_words += 1
            kw_score = matched_words / max(1, len(informative_q_words)) if informative_q_words else 0.0
            
            # 2. Structural Compatibility
            struct_score = 0.0
            for cue in detected_structural_cues:
                cue_triggers = structural_keywords[cue]
                if any(t in content_lower for t in cue_triggers):
                    struct_score += 0.50
            struct_score = min(0.70, struct_score)
            
            # 3. Specific Numbered Item Reference Match
            ref_score = 0.0
            for ref_num in specific_refs:
                pat = rf'\b(?:topic|point|question|theme|part|item|step|option|q)?\s*{ref_num}\b'
                if re.search(pat, content_lower):
                    ref_score += 0.60
            ref_score = min(0.70, ref_score)
            
            # 4. Content Fit: Pure semantic and structural alignment
            content_fit = min(1.0, 0.40 * kw_score + struct_score + ref_score)
            
            # 5. Conditional Bayesian Recency Bonus: Only awarded if candidate has non-trivial contextual fit
            recency_bonus = (0.15 * math.exp(-0.8 * dist)) if content_fit > 0.15 else 0.0
            
            # 6. Composite Raw Affinity Score (bounded in [0.0, 1.0])
            raw_affinity = min(1.0, content_fit + recency_bonus)
            
            scored_candidates.append({
                **cand,
                "distance": dist,
                "fit": content_fit,
                "raw_affinity": raw_affinity,
                "kw_score": kw_score,
                "struct_score": struct_score,
                "ref_score": ref_score,
                "recency_bonus": recency_bonus
            })

        # Sort candidates by raw affinity descending
        sorted_candidates = sorted(scored_candidates, key=lambda x: x["raw_affinity"], reverse=True)
        top1 = sorted_candidates[0]
        
        # --- DYNAMIC CONTRAST AMPLIFICATION (INVERSE COMPRESSION FORMULATION) ---
        # When top scores are close, apply non-linear variance & contrast magnification:
        # Mathematical formulation: Dynamic gain G = C / max(gap, epsilon)
        # Centering around midpoint mu = (s1 + s2)/2
        # Amplified score S_amp = 1 / (1 + exp(-G * (s - mu)))
        if len(sorted_candidates) > 1:
            top2 = sorted_candidates[1]
            raw_gap = top1["raw_affinity"] - top2["raw_affinity"]
            mu = (top1["raw_affinity"] + top2["raw_affinity"]) / 2.0
            epsilon = 0.015
            amplification_gain = 4.2 / max(raw_gap, epsilon)
            
            for c in sorted_candidates:
                diff_from_mid = c["raw_affinity"] - mu
                exponent = -amplification_gain * diff_from_mid
                clamped_exp = max(-15.0, min(15.0, exponent))
                c["amplified_confidence"] = round(1.0 / (1.0 + math.exp(clamped_exp)), 4)
        else:
            top1["amplified_confidence"] = 0.985
            raw_gap = 1.0

        best_match = sorted_candidates[0]
        is_immediate = (best_match["distance"] == 0)
        
        return {
            "matched_turn_index": best_match["turn_index"],
            "matched_content": best_match["content"],
            "is_immediate_preceding": is_immediate,
            "raw_confidence": round(best_match["raw_affinity"], 4),
            "amplified_confidence": round(best_match["amplified_confidence"], 4),
            "raw_gap": round(raw_gap, 4),
            "total_candidates": len(scored_candidates),
            "candidates_summary": [
                {
                    "turn_index": c["turn_index"],
                    "raw": round(c["raw_affinity"], 3),
                    "amplified": round(c.get("amplified_confidence", c["raw_affinity"]), 3)
                }
                for c in sorted_candidates[:3]
            ]
        }

    def build_context_package(
        self,
        current_user_query: str,
        max_recent_chars: int = 7000,
        compression_threshold_turns: int = 3
    ) -> Dict[str, Any]:
        """
        Builds complete hierarchical context package for the Orchestrator, Structurer, and Workers:
        - Targeted Base Deliverable: resolved via Backward Waterfall Matching with Dynamic Contrast Amplification.
        - Recent Dialogue Turns: conversational context of the immediate preceding turn(s).
        - Compressed Memory: structured summary of older turns when conversation exceeds threshold.
        - RAG Retrieval Excerpts: exact matching sections from any point in chat history.
        """
        messages = self.session.messages or []
        prior_messages = messages[:-1] if (messages and messages[-1].role == "user") else messages

        if not prior_messages:
            return {
                "has_prior_context": False,
                "recent_deliverables_text": "",
                "compressed_memory_text": "",
                "rag_excerpts_text": "",
                "formatted_context_block": "",
                "targeted_match_info": None
            }

        # 1. RAG Retrieval over all past chunks
        retrieved = self.retrieve_relevant_chunks(current_user_query, top_k=4)
        rag_blocks = []
        for chunk, score in retrieved:
            rag_blocks.append(
                f"[Turn {chunk.turn_index} ({chunk.role.title()}) • Section: \"{chunk.heading}\"]\n"
                f"{chunk.content}"
            )
        rag_excerpts_text = "\n\n---\n\n".join(rag_blocks) if rag_blocks else ""

        # 2. Resolve Targeted Base Deliverable via Backward Waterfall Matcher + Contrast Amplification
        targeted_match = self.resolve_targeted_deliverable(current_user_query)

        recent_turns = prior_messages[-2:]  # Last 1-2 turns
        latest_assistant_turn = next((m for m in reversed(prior_messages) if m.role == "assistant"), None)

        if targeted_match and not targeted_match["is_immediate_preceding"]:
            # An earlier turn was matched as the true target of the user's directive!
            targeted_text = targeted_match["matched_content"][:max_recent_chars]
            conf_pct = round(targeted_match["amplified_confidence"] * 100, 1)
            t_idx = targeted_match["matched_turn_index"]
            
            recent_blocks = [
                f"[TARGETED BASE DELIVERABLE (RESOLVED TO TURN {t_idx} VIA BACKWARD WATERFALL, AMPLIFIED CONFIDENCE: {conf_pct}%)]:\n"
                f"{targeted_text}\n"
                f"CRITICAL TARGETING MANDATE: Backward waterfall matching resolved that the user directive ('add ___ in this', 'modify', etc.) specifically targets this deliverable from Turn {t_idx}. Build upon, modify, or extend THIS specific deliverable directly while preserving its established components!"
            ]
            if latest_assistant_turn and latest_assistant_turn.content != targeted_match["matched_content"]:
                latest_snippet = latest_assistant_turn.content[:1500]
                recent_blocks.append(
                    f"[IMMEDIATE PRECEDING TURN (CONVERSATIONAL CONTEXT)]:\n"
                    f"{latest_snippet}\n"
                    f"NOTE: This represents the immediately preceding turn for dialogue continuity."
                )
            recent_deliverables_text = "\n\n".join(recent_blocks)
        else:
            # Immediate preceding turn (T-1) is the target deliverable
            recent_blocks = []
            for m in recent_turns:
                speaker = "User" if m.role == "user" else "Assistant (Previous Swarm Deliverable)"
                clean_content = m.content[:max_recent_chars] if m.content else ""
                recent_blocks.append(f"### {speaker}:\n{clean_content}")
            recent_deliverables_text = "\n\n".join(recent_blocks)

        # 3. Context Compression for Older Turns (> compression_threshold_turns)
        older_turns = prior_messages[:-2] if len(prior_messages) > 2 else []
        compressed_memory_text = ""
        if older_turns:
            summary_lines = []
            for m in older_turns:
                speaker = "User" if m.role == "user" else "Assistant"
                first_line = m.content.split('\n')[0].strip() if m.content else ""
                snippet = first_line[:140] if first_line else m.content[:140].replace('\n', ' ')
                summary_lines.append(f"- Turn {m.role.title()}: {snippet}")
            compressed_memory_text = (
                "[COMPRESSED EARLIER CHAT MEMORY (Turns 1 to " + str(len(older_turns)) + ")]:\n" +
                "\n".join(summary_lines)
            )

        # 4. Formatted Master Context Block
        formatted_parts = []

        if recent_deliverables_text:
            formatted_parts.append(
                "[MOST RECENT CONVERSATION & TARGETED PRECEDING DELIVERABLE (PRIMARY ACTIVE CONTEXT)]:\n"
                f"{recent_deliverables_text}\n"
                "CRITICAL CONTINUITY DIRECTIVE: Ground all modifications, extensions, or answers directly against this targeted deliverable!"
            )

        if rag_excerpts_text and any(word in current_user_query.lower() for word in [
            "change", "modify", "update", "replace", "revise", "in ", "point", "topic",
            "question", "theme", "part", "explain", "remember", "previous", "earlier", "first"
        ]):
            formatted_parts.append(
                "[HISTORICAL CHAT CONTEXT & RELEVANT EXCERPTS FROM EARLIER TURNS]:\n"
                f"{rag_excerpts_text}\n"
                "NOTE: These excerpts provide historical background. Do NOT let them override or replace the latest active conversation above!"
            )

        if compressed_memory_text:
            formatted_parts.append(compressed_memory_text)

        formatted_context_block = "\n\n" + "\n\n".join(formatted_parts) + "\n\n" if formatted_parts else ""

        return {
            "has_prior_context": True,
            "recent_deliverables_text": recent_deliverables_text,
            "compressed_memory_text": compressed_memory_text,
            "rag_excerpts_text": rag_excerpts_text,
            "formatted_context_block": formatted_context_block,
            "targeted_match_info": targeted_match
        }
