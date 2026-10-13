# ==============================================================================
# OmniTask AI - Production Multi-Stage Dockerfile
# Stage 1: Build Frontend (Vite + React + Tailwind + Lucide)
# Stage 2: Python 3.12 Backend Server (FastAPI + Uvicorn + Common Context Engine)
# ==============================================================================

# --- Stage 1: Frontend Build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Python Runtime ---
FROM python:3.12-slim AS runner
WORKDIR /app

# Install system dependencies (curl for healthchecks, fonts for ReportLab if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy Backend application
COPY backend/ /app/backend/

# Copy compiled frontend from Stage 1 into the location expected by FastAPI
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure persistence directories exist
RUN mkdir -p /app/backend/uploads/chats \
             /app/backend/uploads/memory \
             /app/backend/uploads/generated \
             /app/backend/uploads/sessions \
             /app/uploads/sessions

WORKDIR /app/backend

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Launch application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
