# OmniTask AI 🚀
### Universal Multi-Agent Task Orchestration & AI Decision Ecosystem

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-1.0-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](#-license)

> **OmniTask AI** is an all-in-one multi-agent platform designed to tackle complex, multi-stage workflows that standard single-model AIs cannot execute alone. It integrates high-speed task classification via **Jev (System 1)**, interactive planning and user clarification gates, state persistence and error mitigation through a **Common Context Blackboard**, domain-matched intermediate quality gates powered exclusively by **Google Gemini**, and specialist worker execution across **Qwen 2.5 Coder**, **Mistral**, **OpenAI GPT**, and **Flux.1**.

---

## 🌟 Architecture & Model Specialization

```
[User Natural Language Prompt + Ingested Data / Files]
                         │
                         ▼
             [1. JSON Structurer Agent]
                         │
                         ▼
        [2. Jev Fast Decision Router (System 1)]   <── STRICTLY ROUTING ONLY
        (Decomposes into DAG and binds models in <100ms)
                         │
                         ▼
+=============================================================================+
|                      COMMON CONTEXT BLACKBOARD MEMORY                       |
|  - Global Prerequisites & Ingested Assets                                    |
|  - Cumulative Verified State & Artifact Registry                             |
|  - Negative Knowledge Base (Error mitigations & avoidance rules)            |
+=============================================================================+
         │                                                   ▲               ▲
         │ Injects Prerequisites & Avoidance Rules           │ Logs Output   │ Logs Review
         ▼                                                   │               │
+-------------------+      Passes Output      +----------------------------+ │
| Specialist Worker | ──────────────────────> | 3. Gemini Reviewer Agent   |─+
| (Qwen / Mistral / |                         | (Multimodal Vision + AST   |
|  Gemini / GPT /   |                         |  Static Analysis Review)   |
|  Flux.1)          |                         +----------------------------+
+-------------------+                                        │
         │                                                   │ Approved
         └───────────────────(Loop through DAG)──────────────┘
                                     │
                                     ▼
                [4. Final Reviewer & Evaluation Agent]
                - Objective Completion Score (0-100%)
                - Compliance Breakdown & Audit Diagnostics
                                     │
                                     ▼
                        [5. Final Delivery to User]
```

### Specialist Sub-Agent Lineup:
* **Router**: **Jev (Vercel API / TypeSafe)** — *Strictly for Routing Only* ($<100\text{ms}$ System 1 classification).
* **Dedicated Quality Gate**: **Google Gemini 2.0 Flash** — *Strictly for Reviewing Only* (Multimodal visual inspection, code syntax & security QA).
* **Coding Specialist**: **Qwen 2.5 Coder (via Groq Cloud)** — Production-grade Python/TypeScript architecture and type-safe algorithms.
* **Summarizer Specialist**: **Google Gemini 2.0 Flash** — High-context distillation and executive brief synthesis.
* **Legal & Formal Logic Specialist**: **Mistral (Mistral AI)** — Regulatory compliance, contract verification, and mathematical bound proofs.
* **Auditing Specialist**: **OpenAI GPT (GPT-4o-mini)** — Cross-stage integrity checks, factual consistency, and security audits.
* **Visual Asset Specialist**: **Flux.1 (via Pollinations)** — Real-time high-resolution technical infographics and visual renders.

---

## 🧠 Hidden Context, Memory Architecture & Multi-Turn Retention

OmniTask AI features a production-grade multi-tier context and memory ecosystem engineered to eliminate LLM amnesia, cross-turn hallucinations, and sub-agent state drift across long-running tasks.

```
+========================================================================================+
|                              PERSISTENT GLOBAL MEMORY                                   |
|  - Cross-chat persistent user preferences, business objectives & project profiles     |
|  - Autonomous consolidation across past sessions (Prepended foundational memory)      |
+========================================================================================+
                                           │
                                           ▼
+========================================================================================+
|                        COMMON CONTEXT BLACKBOARD (WORKING STATE)                       |
|  - Ingested files & extracted reference materials                                     |
|  - Hidden Inter-Agent Handovers (<agent_handover> parameters)                         |
|  - Cumulative verified artifacts & step deliverables                                   |
|  - Dynamic Negative Knowledge Base (Error mitigations & avoidance directives)         |
+========================================================================================+
                                           │
                                           ▼
+========================================================================================+
|                       MULTI-TURN CONTEXT RAG & CASCADE MATCHER                         |
|  - Backward Waterfall Turn Matcher (T-1 down to T-N cascade)                          |
|  - Dynamic Contrast Amplification Formulation (Inverse compression of confidence gaps) |
|  - Hierarchical semantic chunk retrieval & older turn compression                     |
+========================================================================================+
```

### 1. Common Context Blackboard (Shared Working Memory & Hidden Context)
The Common Context Blackboard operates as the central, real-time single source of truth across all executing sub-agents throughout a workflow:
* **Hidden Context Assembly**: Sub-agents do not operate in a vacuum. Before execution, the orchestrator automatically compiles a structured context packet injecting verified prerequisites, ingested file contents, cumulative prior step outputs, and active constraints.
* **Dual-Channel Inter-Agent Handovers**: Workers produce clean, user-facing markdown deliverables on the primary channel, while passing internal technical parameters, secret states, or downstream triggers through structured hidden handovers (`<agent_handover>{"key": "val"}</agent_handover>`). The blackboard extracts these parameters into memory without cluttering the user's chat display.
* **Dynamic Negative Knowledge Base**: Intermediate warnings, QA failures, and user negative directives (`"don't include X"`, `"not day-wise"`, `"without external libraries"`) are recorded as negative knowledge. Downstream workers automatically inherit avoidance directives to ensure the swarm never repeats an earlier mistake.

### 2. Persistent Global Memory (Cross-Chat Long-Term Memory)
A dedicated persistent memory engine that bridges conversations across days and weeks:
* **User Identity & Business Context**: Automatically remembers user profile details, ongoing projects, coding preferences, brand guidelines, and core constraints.
* **Autonomous Consolidation**: At the start of a session, historical conversations are analyzed to consolidate recurring facts and preferences. This distilled knowledge is prepended as a foundational memory block so the assistant never suffers from cross-session amnesia.
* **Zero Disruption**: Persistent memory operates completely in the background without requiring manual prompt repetition or manual project re-configuration.

### 3. Multi-Turn Context RAG & Hierarchical Memory Compression
To support extended conversations without exceeding token limits or causing attention dilution:
* **Tier 1: Full-Fidelity Active Turn ($T-1$)**: Preserves the complete preceding deliverable to serve as the immediate grounding surface for follow-up turns.
* **Tier 2: Hierarchical Semantic RAG**: The chat history is segmented into semantic units (sections, code blocks, tables, questions). When a user specifically references past points (*"change topic 3"*, *"update question 2"*, *"in that table we made earlier"*), RAG retrieves the exact historical excerpts.
* **Tier 3: Context Compression**: Turns older than the active window ($T-2 \dots T-N$) are condensed into high-density summary lines, preserving high-level continuity while saving token budget.

### 4. Backward-Traversing Waterfall Matcher with Dynamic Contrast Amplification
When a user asks a follow-up modification or query (e.g., *"add ___ in this"*, *"why did you do this?"*, *"can we change section 2?"*), standard systems often anchor onto the wrong historical message or get confused by superficial keyword overlap. OmniTask AI implements a **Temporal Waterfall Search with Dynamic Contrast Amplification**:

* **Temporal Waterfall Traversal**: Evaluates candidate deliverables backwards chronologically ($T-1$, then $T-2$, etc.). If $T-1$ lacks topical or structural fit (e.g., $T-1$ was a short clarification or poem, and $T-2$ was the actual quiz or table), it cascades backwards until it finds the genuine target deliverable.
* **Stem-Aware Content Fit**: Normalizes word variations (*questions $\to$ question*, *recipes $\to$ recip*, *topics $\to$ topic*) to compute exact lexical, structural, and entity alignment.
* **Dynamic Contrast Amplification Formulation** (Mathematical Inverse of Min-Max / Z-Score Compression):
  When candidate turns have close confidence scores (e.g., $s_1 = 0.62$ vs $s_2 = 0.60$, a minute margin of $\Delta = 0.02$):
  $$\text{Gain } G(\Delta) = \frac{4.2}{\max(\Delta, 0.015)}$$
  $$S_{\text{amplified}}(s) = \frac{1}{1 + \exp\left(-G(\Delta) \cdot (s - \mu)\right)} \quad \text{where } \mu = \frac{s_1 + s_2}{2}$$
  This non-linear dispersion formula dynamically magnifies a minute $0.02$ difference into an **unequivocal $78.2\%$ separation** ($89.1\%$ vs $10.9\%$), eliminating ambiguity and locking the exact intended deliverable as the primary grounding target.

### 5. Universal Cardinality Disambiguation & Deliverable Purity
* **Cardinality Disambiguation**: Intelligently separates domain context measurements/timelines (e.g., *9 days, 30-day challenge, 12 weeks, 15-30s clips, 100m sprint*) from target generation counts. It delivers the organically optimal, non-padded set (typically 3 to 6 distinct pillars) rather than hallucinating filler items to reach a duration number.
* **Deliverable Purity**: Primary deliverables strictly contain authentic user-facing items (code, topics, recipes, questions), while internal strategies, creator advice, and soft-selling guidelines are routed into a dedicated `### Operational Strategy & Execution Guidelines` section at the end.
* **Direct Q&A Resolution**: When a user raises a doubt, conceptual objection, or feasibility question (*"how can we do this in practice?"*, *"isn't X a one-day thing?"*), the engine provides direct, thorough answers grounded in the preceding deliverable rather than blindly restarting the generation from scratch.

## 🚀 Dual-Track Capabilities

### Track 1: Free AI Advisor & Directory (DIY)
* Describe any complex objective in natural language.
* The system breaks down the task and prescribes the exact best-in-class AI models from an onboarded matrix of 40+ leading tools.
* Generates copy-paste prompt templates and a step-by-step DIY roadmap for free self-execution.

### Track 2: Paid Omni Autonomous Execution Engine
* Ingest files, CSVs, documentation, or raw prompts.
* Autonomous pipeline executes structuring, Jev routing, worker processing, intermediate Gemini reviews, Blackboard memory updates, and final delivery with an objective completion score.

---

## 🛠️ Quick Start Guide

### Prerequisites
* **Python 3.12** (`py -3.12` or `python 3.12`)
* **Node.js 20+** & **npm**
* **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/yatharthsachdeva23/OmniTask-AI.git
cd OmniTask-AI
```

### 2. Setup Python 3.12 Virtual Environment
```bash
# Create venv
py -3.12 -m venv venv

# Activate venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 3. Build Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Configure Environment Credentials (Optional)
Copy the example environment file:
```bash
cp backend/.env.example backend/.env
```
Add your API keys to `backend/.env` for live API calls.  
*(Note: If keys are omitted, OmniTask AI automatically runs smart high-fidelity simulation so you can explore the full UI and agent graph immediately without required billing).*
 
### 5. Launch OmniTask AI
```bash
python run.py
```
Open your browser at:  
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🧪 Testing & Verification

Run the dedicated test suites to verify sub-agents and endpoints:

```bash
# Verify all 5 specialist models + Gemini review gates
python backend/test_models.py

# Verify end-to-end multi-agent streaming pipeline
python backend/test_pipeline.py

# Verify FastAPI endpoints and frontend delivery
python backend/test_system.py
```

---

## 📁 Repository Structure

```
OmniTask-AI/
├── backend/
│   ├── app/
│   │   ├── advisor/              # Track 1: Tool matrix & recommendation engine
│   │   ├── config.py             # App configuration & environment loader
│   │   ├── core/
│   │   │   ├── blackboard.py         # Common Context Window, State Registry & Avoidance Rules
│   │   │   ├── chat_manager.py       # Multi-turn chat session & metadata management
│   │   │   ├── context_rag.py        # Backward waterfall matcher & contrast amplification RAG
│   │   │   ├── hermes_memory.py      # Dedicated Persistent Global Memory Engine
│   │   │   ├── interactive_planner.py# System 2 planning & user clarification gates
│   │   │   ├── dynamic_replanner.py  # Adaptive DAG replenishment & swarm expansion
│   │   │   ├── evaluator.py          # Final completion scoring & packaging
│   │   │   ├── jev_router.py         # Jev System 1 Fast Router (Routing Only)
│   │   │   └── structurer.py         # JSON Structurer Agent
│   │   ├── main.py               # FastAPI application & static mount
│   │   ├── models/               # Strict Pydantic schemas & contracts
│   │   ├── orchestrator.py       # End-to-end SSE Multi-Agent Loop
│   │   ├── reviewers/            # Dedicated Gemini Multimodal Review Engine
│   │   └── workers/              # Qwen Coder, Mistral, Gemini, GPT, Flux.1
│   ├── requirements.txt          # Python dependencies
│   ├── test_models.py            # Individual specialist model tests
│   ├── test_pipeline.py          # End-to-end pipeline test
│   └── test_system.py            # API endpoint health verification
├── frontend/
│   ├── src/
│   │   ├── components/           # UI components (DAG visualizer, Blackboard feed)
│   │   ├── types.ts              # TypeScript interfaces matching backend models
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── dist/                     # Pre-compiled production UI bundle
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── .gitignore                    # Watertight git rules
├── IMPLEMENTATION_PLAN.md        # Technical execution roadmap
├── OMNITASK_AI_CONCEPT.md        # Conceptual specification blueprint
├── README.md                     # Project documentation
└── run.py                        # Single-command launcher
```

---

## 📄 License
Copyright © 2026 Yatharth Sachdeva. All rights reserved.

Proprietary and confidential. Unauthorized copying, distribution, modification, reverse engineering, or commercial use is strictly prohibited. See [LICENSE](LICENSE) for details.
