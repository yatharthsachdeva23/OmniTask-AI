import json
import time
import uuid
import re
from pathlib import Path
from typing import List, Optional, Dict, Any

from app.models.schemas import (
    ChatSession,
    ChatSessionMeta,
    ChatMessage,
    IngestedFile
)

class ChatManager:
    """
    Manages multi-turn conversation persistence, chat sessions,
    and message history for OmniTask AI.
    Stores chat sessions as JSON files in uploads/chats/.
    """
    def __init__(self, chats_dir: Optional[Path] = None):
        if not chats_dir:
            self.chats_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "chats"
        else:
            self.chats_dir = chats_dir
        self.chats_dir.mkdir(parents=True, exist_ok=True)

    def derive_title(self, prompt: str, objective: Optional[str] = None) -> str:
        """Derives a concise, professional 3-6 word title from user prompt or structured objective."""
        text = (objective if objective and len(objective.strip()) > 5 else prompt) or "New Conversation"
        # Strip persistent memory blocks if present
        if "======================================================================" in text:
            parts = text.split("======================================================================")
            if len(parts) >= 3:
                text = parts[-1].strip()
        if "[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:" in text:
            text = text.split("[USER CURRENT DIRECTIVE / MODIFICATION REQUEST]:")[-1].strip()
        cleaned = text.strip()
        # Remove markdown symbols and common conversational prefixes
        cleaned = re.sub(r'[*_`#"\']', '', cleaned)
        cleaned = re.sub(
            r'^(?:please\s+|can\s+you\s+|i\s+want\s+to\s+|help\s+me\s+|create\s+a\s+|make\s+a\s+|generate\s+a\s+|write\s+a\s+|build\s+a\s+|suggest\s+(?:me\s+)?(?:what\s+are\s+the\s+possible\s+)?|propose\s+a\s+|design\s+a\s+|formulate\s+a\s+|have\s+[a-z,\s]+(?:we\s+want\s+to\s+make\s+|for\s+)|give\s+me\s+(?:a\s+list\s+of\s+)?)',
            '',
            cleaned,
            flags=re.IGNORECASE
        ).strip()

        # Check for course code (e.g. IT429, CS101)
        m_course = re.search(r'\b([A-Z]{2,4}\s*\d{3,4})\b', text, re.IGNORECASE)
        course_str = f"{m_course.group(1).upper()} " if m_course else ""

        # Remove trailing clauses like "which we will post...", "for this whole...", "as our primary..."
        cleaned = re.sub(r'\s+(?:which|as|that|so|for\s+this|in\s+order\s+to|to\s+communicate).*$', '', cleaned, flags=re.IGNORECASE)

        words = cleaned.split()
        if len(words) >= 3:
            title = ' '.join(words[:5])
        else:
            title = cleaned or "New Conversation"

        title = title.title()
        if len(title) > 38:
            title = title[:38].rsplit(' ', 1)[0]

        final_title = f"{course_str}{title}".strip()
        return final_title if final_title else "New Conversation"

    def list_chats(self) -> List[ChatSessionMeta]:
        """Lists all chat sessions ordered by most recently updated."""
        metas: List[ChatSessionMeta] = []
        try:
            for file_path in self.chats_dir.glob("*.json"):
                try:
                    data = json.loads(file_path.read_text(encoding="utf-8-sig"))
                    meta = ChatSessionMeta(
                        id=data.get("id", file_path.stem),
                        title=data.get("title", "Conversation"),
                        created_at=data.get("created_at", file_path.stat().st_ctime),
                        updated_at=data.get("updated_at", file_path.stat().st_mtime),
                        message_count=len(data.get("messages", [])),
                        preview=data.get("messages", [{}])[-1].get("content", "")[:120] if data.get("messages") else ""
                    )
                    metas.append(meta)
                except Exception as parse_err:
                    print(f"[ChatManager] Error parsing chat {file_path.name}: {parse_err}")
        except Exception as e:
            print(f"[ChatManager] Error listing chats: {e}")

        metas.sort(key=lambda m: m.updated_at, reverse=True)
        return metas

    def get_chat(self, chat_id: str) -> Optional[ChatSession]:
        """Loads a full ChatSession by id."""
        file_path = self.chats_dir / f"{chat_id}.json"
        if not file_path.exists():
            return None
        try:
            data = json.loads(file_path.read_text(encoding="utf-8-sig"))
            return ChatSession(**data)
        except Exception as e:
            print(f"[ChatManager] Error loading chat {chat_id}: {e}")
            return None

    def create_chat(
        self,
        title: Optional[str] = None,
        initial_prompt: Optional[str] = None,
        delivery_mode: str = "smart"
    ) -> ChatSession:
        """Creates and saves a new ChatSession."""
        chat_id = f"chat_{uuid.uuid4().hex[:10]}"
        now = time.time()
        final_title = title or (self.derive_title(initial_prompt) if initial_prompt else "New Conversation")

        session = ChatSession(
            id=chat_id,
            title=final_title,
            created_at=now,
            updated_at=now,
            messages=[],
            delivery_mode=delivery_mode
        )
        self.save_chat(session)
        return session

    def save_chat(self, session: ChatSession):
        """Persists ChatSession to disk as formatted JSON."""
        file_path = self.chats_dir / f"{session.id}.json"
        try:
            file_path.write_text(session.model_dump_json(indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[ChatManager] Error saving chat {session.id}: {e}")

    def update_chat_title(self, chat_id: str, new_title: str) -> bool:
        """Renames a chat title."""
        session = self.get_chat(chat_id)
        if not session:
            return False
        session.title = new_title.strip() or session.title
        session.updated_at = time.time()
        self.save_chat(session)
        return True

    def delete_chat(self, chat_id: str) -> bool:
        """Deletes a chat file from disk."""
        file_path = self.chats_dir / f"{chat_id}.json"
        if file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as e:
                print(f"[ChatManager] Error deleting chat {chat_id}: {e}")
                return False
        return False

    def add_user_message(
        self,
        chat_id: str,
        content: str,
        files: Optional[List[IngestedFile]] = None,
        delivery_mode: str = "smart",
        clarifications: Optional[Dict[str, str]] = None,
        approved_plan_summary: Optional[str] = None
    ) -> ChatMessage:
        """Appends a user message to an existing chat session."""
        session = self.get_chat(chat_id)
        if not session:
            session = self.create_chat(initial_prompt=content, delivery_mode=delivery_mode)

        now = time.time()
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        user_msg = ChatMessage(
            id=msg_id,
            role="user",
            content=content,
            timestamp=now,
            files=files or [],
            delivery_mode=delivery_mode,
            clarifications=clarifications,
            approved_plan_summary=approved_plan_summary
        )

        session.messages.append(user_msg)
        session.updated_at = now
        if len(session.messages) == 1 and session.title == "New Conversation":
            session.title = self.derive_title(content)

        self.save_chat(session)
        return user_msg

    def add_assistant_message(
        self,
        chat_id: str,
        content: str,
        execution_data: Optional[Dict[str, Any]] = None,
        blackboard_state: Optional[Dict[str, Any]] = None,
        latest_evaluation: Optional[Dict[str, Any]] = None,
        latest_session_memory: Optional[Dict[str, Any]] = None
    ) -> ChatMessage:
        """Appends an assistant turn to an existing chat session."""
        session = self.get_chat(chat_id)
        if not session:
            session = self.create_chat(delivery_mode="smart")

        now = time.time()
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        asst_msg = ChatMessage(
            id=msg_id,
            role="assistant",
            content=content,
            timestamp=now,
            execution_data=execution_data
        )

        session.messages.append(asst_msg)
        session.updated_at = now
        if blackboard_state:
            session.blackboard_state = blackboard_state
        if latest_evaluation:
            session.latest_evaluation = latest_evaluation
        if latest_session_memory:
            session.latest_session_memory = latest_session_memory

        self.save_chat(session)
        return asst_msg

chat_manager = ChatManager()
