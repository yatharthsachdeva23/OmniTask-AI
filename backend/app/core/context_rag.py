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

    def build_context_package(
        self,
        current_user_query: str,
        max_recent_chars: int = 7000,
        compression_threshold_turns: int = 3
    ) -> Dict[str, Any]:
        """
        Builds complete hierarchical context package for the Orchestrator, Structurer, and Workers:
        - Full Recent Deliverables: complete text of the immediate previous turn(s).
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
                "formatted_context_block": ""
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

        # 2. Recent Active Turns (Full Fidelity)
        recent_turns = prior_messages[-2:]  # Last 1-2 turns
        recent_blocks = []
        for m in recent_turns:
            speaker = "User" if m.role == "user" else "Assistant (Previous Swarm Deliverable)"
            # Preserve full deliverable up to max_recent_chars
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
                # Extract first heading or distilled 150 chars
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
                "[MOST RECENT CONVERSATION & COMPLETE PRECEDING DELIVERABLE (PRIMARY ACTIVE CONTEXT)]:\n"
                f"{recent_deliverables_text}\n"
                "CRITICAL CONTINUITY DIRECTIVE: The user's query is an immediate reply to this latest turn. Address their doubt, question, or modification directly against this most recent output!"
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
            "formatted_context_block": formatted_context_block
        }
