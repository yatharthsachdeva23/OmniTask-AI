import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional

from app.models.schemas import (
    TaskRequest,
    IngestedFile,
    AdvisorResponse,
    InteractivePlanResponse,
    ChatSession,
    ChatSessionMeta,
    ChatUpdateRequest,
)
from app.core.chat_manager import chat_manager
from app.advisor.recommender import AIAdvisorEngine
from app.advisor.tools_catalog import AI_TOOLS_CATALOG
from app.orchestrator import OmniOrchestrator
from app.core.interactive_planner import InteractivePlannerAgent
from app.core.hermes_memory import hermes_memory

app = FastAPI(
    title="OmniTask AI API",
    description="Universal Multi-Agent Orchestration & AI Decision Engine",
    version="1.0.0"
)

# Enable CORS for local dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

advisor_engine = AIAdvisorEngine()
orchestrator = OmniOrchestrator()
interactive_planner = InteractivePlannerAgent()

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "system": "OmniTask AI Core Engine",
        "python_version": "3.12",
        "jev_system1_router": "online",
        "common_context_engine": "ready",
        "ask_before_doing": "online"
    }

@app.post("/api/interactive-plan", response_model=InteractivePlanResponse)
async def generate_interactive_plan(payload: dict):
    prompt = payload.get("prompt", "").strip()
    files_data = payload.get("files", [])
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required to formulate an implementation plan")
    
    files = []
    for f in files_data:
        try:
            files.append(IngestedFile(**f))
        except Exception:
            pass
            
    plan = await interactive_planner.plan_async(prompt, files)
    return plan

@app.get("/api/catalog")
async def get_tools_catalog():
    return {
        "total_tools": len(AI_TOOLS_CATALOG),
        "catalog": AI_TOOLS_CATALOG
    }

@app.post("/api/advisor/suggest", response_model=AdvisorResponse)
async def get_ai_advice(payload: dict):
    prompt = payload.get("prompt", "").strip()
    raw_mode = str(payload.get("delivery_mode", "smart")).strip().lower()
    delivery_mode = "strict" if raw_mode == "strict" else "smart"
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    response = await advisor_engine.advise_async(prompt, delivery_mode=delivery_mode)
    try:
        sessions_dir = Path(__file__).resolve().parent.parent / "uploads" / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        (sessions_dir / "latest_advisor.json").write_text(response.model_dump_json(indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[Advisor] Error saving snapshot: {e}")
    return response

from app.utils.file_parser import extract_text_from_file_bytes

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_DIR = UPLOAD_DIR / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/generated-images", StaticFiles(directory=str(GENERATED_DIR)), name="generated-images")
app.mount("/api/generated-media", StaticFiles(directory=str(GENERATED_DIR)), name="generated-media")

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename or "uploaded_file"

    # Save physical copy for local file access if needed
    save_path = UPLOAD_DIR / filename
    try:
        with open(save_path, "wb") as f_out:
            f_out.write(contents)
    except Exception as e:
        print(f"[Upload] Warning: Could not write file to uploads dir: {e}")

    # Extract readable text from PDF, Docx, or Plaintext
    extracted_text, detected_type = extract_text_from_file_bytes(filename, contents)
    
    # Store rich text context up to 45,000 chars for LLM context injection
    preview = extracted_text[:45000]

    return IngestedFile(
        filename=filename,
        content_type=detected_type or file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        preview_or_content=preview
    )

@app.get("/api/chats", response_model=List[ChatSessionMeta])
async def list_chats():
    return chat_manager.list_chats()

@app.post("/api/chats", response_model=ChatSession)
async def create_chat(payload: Optional[dict] = None):
    title = (payload or {}).get("title")
    mode = (payload or {}).get("delivery_mode", "smart")
    user_id = (payload or {}).get("user_id", "default_user") or "default_user"
    # Initiate autonomous persistent memory consolidation from all previous chats the moment a new chat begins
    try:
        await hermes_memory.consolidate_from_all_chats(user_id=user_id)
    except Exception as mem_err:
        print(f"[Main] Persistent memory consolidation notice on new chat: {mem_err}")
    return chat_manager.create_chat(title=title, delivery_mode=mode)

@app.delete("/api/chats")
async def clear_all_chats():
    """Clears all chat sessions from disk."""
    chats = chat_manager.list_chats()
    deleted_count = 0
    for c in chats:
        if chat_manager.delete_chat(c.id):
            deleted_count += 1
    return {"status": "success", "deleted_count": deleted_count}

@app.get("/api/user/memory")
async def get_user_memory(user_id: str = "default_user"):
    """Fetches the user's dedicated persistent memory."""
    return hermes_memory.get_user_memory(user_id)

@app.post("/api/user/memory/consolidate")
async def consolidate_user_memory(payload: Optional[dict] = None):
    """Triggers autonomous consolidation of memory across all previous chats."""
    user_id = (payload or {}).get("user_id", "default_user") or "default_user"
    updated = await hermes_memory.consolidate_from_all_chats(user_id)
    return {"status": "success", "memory": updated}

@app.delete("/api/user/memory")
async def clear_user_memory(user_id: str = "default_user"):
    """Resets the user's dedicated persistent memory."""
    success = hermes_memory.clear_user_memory(user_id)
    return {"status": "success" if success else "failed"}

@app.get("/api/chats/{chat_id}", response_model=ChatSession)
async def get_chat(chat_id: str):
    session = chat_manager.get_chat(chat_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session

@app.patch("/api/chats/{chat_id}")
async def update_chat(chat_id: str, payload: ChatUpdateRequest):
    if not payload.title:
        raise HTTPException(status_code=400, detail="Title is required")
    success = chat_manager.update_chat_title(chat_id, payload.title)
    if not success:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "success", "chat_id": chat_id, "title": payload.title}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    success = chat_manager.delete_chat(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "success", "deleted_chat_id": chat_id}

@app.post("/api/execute")
async def execute_task(request: TaskRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Task prompt cannot be empty")

    return StreamingResponse(
        orchestrator.execute_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Static Frontend Mount (if built)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DIST_DIR = BASE_DIR / "frontend" / "dist"

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Allow API paths to fall through
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
