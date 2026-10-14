import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Zap,
  CheckCircle2,
  Clock,
  RotateCcw,
  Paperclip,
  Cpu,
  Layers,
  Sparkles,
  Download,
  AlertCircle,
  MessageSquare,
  Send,
  Plus,
  PanelLeft,
  PanelLeftClose,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  User,
  Bot,
  Brain,
  Target
} from 'lucide-react';
import {
  IngestedFile,
  StructuredGoal,
  BlackboardSnapshot,
  StructuredSubTask,
  FinalEvaluationResult,
  DeliveryMode,
  ChatMessage,
  ChatSession,
  SessionMemoryState,
  InteractivePlanResponse
} from '../types';
import { LiveExecutionVisualizer } from './LiveExecutionVisualizer';
import { ChatSidebar } from './ChatSidebar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SessionMemoryModal } from './SessionMemoryModal';
import { InteractivePlanCard } from './InteractivePlanCard';

interface WorkerWorkspaceProps {
  prompt: string;
  files: IngestedFile[];
  askBeforeDoing: boolean;
  deliveryMode?: DeliveryMode;
  clarifications?: Record<string, string>;
  approvedPlanSummary?: string;
  initialChatId?: string | null;
  onBack: () => void;
  onRunAgain?: (newPrompt: string) => void;
}

export const WorkerWorkspace: React.FC<WorkerWorkspaceProps> = ({
  prompt: initialPrompt,
  files: initialFiles,
  askBeforeDoing,
  deliveryMode = 'smart',
  clarifications,
  approvedPlanSummary,
  initialChatId = null,
  onBack,
  onRunAgain
}) => {
  // Sidebar & Chat Session State
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId);
  const [chatTitle, setChatTitle] = useState<string>('Autonomous Swarm Session');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState<number>(0);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);

  // Execution & Swarm States
  const [currentDeliveryMode, setCurrentDeliveryMode] = useState<DeliveryMode>(deliveryMode);
  const [currentAskBeforeDoing, setCurrentAskBeforeDoing] = useState<boolean>(askBeforeDoing);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [interactivePlan, setInteractivePlan] = useState<InteractivePlanResponse | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [customNotes, setCustomNotes] = useState<string>('');
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [pendingFiles, setPendingFiles] = useState<IngestedFile[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [currentStage, setCurrentStage] = useState<string>('READY');
  const [stageMessage, setStageMessage] = useState<string>('Ready to orchestrate multi-agent workflow');
  const [structuredGoal, setStructuredGoal] = useState<StructuredGoal | null>(null);
  const [blackboard, setBlackboard] = useState<BlackboardSnapshot | null>(null);
  const [activeSubtask, setActiveSubtask] = useState<StructuredSubTask | null>(null);
  const [finalEvaluation, setFinalEvaluation] = useState<FinalEvaluationResult | null>(null);

  // Multi-Turn Session Memory & Context RAG State
  const [sessionMemory, setSessionMemory] = useState<SessionMemoryState | null>(null);
  const [isSessionMemoryModalOpen, setIsSessionMemoryModalOpen] = useState<boolean>(false);

  // Input & Interactive Chat States
  const [inputText, setInputText] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<IngestedFile[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const initialExecutionStartedRef = useRef<boolean>(false);

  // Progress Calculation
  const calculateProgress = (): number => {
    if (finalEvaluation || currentStage === 'COMPLETED') return 100;
    if (currentStage === 'STARTING') return 8;
    if (currentStage === 'STRUCTURING') return 20;
    if (currentStage === 'JEV_ROUTING') return 35;

    const totalSteps = structuredGoal?.sub_tasks?.length || 3;
    const completedCount = blackboard ? Object.keys(blackboard.completed_outputs || {}).length : 0;

    if (currentStage === 'EXECUTING' || activeSubtask) {
      const stepPortion = (completedCount / totalSteps) * 50;
      return Math.min(92, Math.round(40 + stepPortion));
    }

    if (currentStage === 'FINAL_EVALUATION') return 94;
    return isExecuting ? 15 : 0;
  };

  const progressPercent = calculateProgress();

  // Scroll to bottom on updates
  const scrollToBottom = () => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isExecuting) {
      scrollToBottom();
    }
  }, [currentStage, stageMessage, activeSubtask, isExecuting]);

  // Load chat by ID
  const loadChat = async (chatId: string) => {
    try {
      setIsLoadingChat(true);
      const res = await fetch(`/api/chats/${chatId}`);
      if (res.ok) {
        const data: ChatSession = await res.json();
        setCurrentChatId(data.id);
        setChatTitle(data.title);
        setMessages(data.messages || []);
        setCurrentDeliveryMode(data.delivery_mode || 'smart');

        // Restore latest assistant execution data
        const assistantMsgs = (data.messages || []).filter(m => m.role === 'assistant');
        const lastAsst = assistantMsgs[assistantMsgs.length - 1];

        if (lastAsst?.execution_data) {
          setStructuredGoal(lastAsst.execution_data.structured_goal || null);
          setBlackboard(lastAsst.execution_data.blackboard_state || data.blackboard_state || null);
          setFinalEvaluation(lastAsst.execution_data.final_evaluation || data.latest_evaluation || null);
          setCurrentStage(lastAsst.execution_data.stage || 'COMPLETED');
          setStageMessage(`Task execution finalized • Score: ${lastAsst.execution_data.final_evaluation?.overall_completion_score || 95}%`);
        } else if (data.blackboard_state || data.latest_evaluation) {
          setBlackboard(data.blackboard_state || null);
          setFinalEvaluation(data.latest_evaluation || null);
          setCurrentStage('COMPLETED');
          setStageMessage('Session deliverables loaded.');
        } else {
          setCurrentStage('READY');
          setStageMessage('Conversation loaded.');
          setStructuredGoal(null);
          setBlackboard(null);
          setFinalEvaluation(null);
        }
        // Restore Multi-Turn Session Memory
        if (data.latest_session_memory) {
          setSessionMemory(data.latest_session_memory);
        } else if (lastAsst?.execution_data?.session_memory) {
          setSessionMemory(lastAsst.execution_data.session_memory);
        } else {
          fetch(`/api/chats/${chatId}/session-memory`)
            .then(r => r.ok ? r.json() : null)
            .then(sm => { if (sm) setSessionMemory(sm); })
            .catch(() => {});
        }

        setIsExecuting(false);
      }
    } catch (err) {
      console.error('Error loading chat session:', err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Start new empty chat
  const handleNewChat = () => {
    setCurrentChatId(null);
    setChatTitle('New Autonomous Task');
    setMessages([]);
    setStructuredGoal(null);
    setBlackboard(null);
    setActiveSubtask(null);
    setFinalEvaluation(null);
    setSessionMemory(null);
    setInteractivePlan(null);
    setPendingPrompt('');
    setPendingFiles([]);
    setIsPlanning(false);
    setCurrentStage('READY');
    setStageMessage('Ready to start a new autonomous task...');
    setIsExecuting(false);
    setInputText('');
    setAttachedFiles([]);
  };

  // Run SSE execution turn
  const runExecutionTurn = async (
    promptText: string,
    filesList: IngestedFile[],
    userClarifications?: Record<string, string>,
    planSummary?: string,
    existingChatId?: string | null
  ) => {
    if (!promptText.trim()) return;

    // Immediately push user turn into message feed
    const tempUserMsgId = `user-${Date.now()}`;
    const newUserMsg: ChatMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: promptText,
      timestamp: Date.now() / 1000,
      files: filesList,
      delivery_mode: currentDeliveryMode,
      clarifications: userClarifications,
      approved_plan_summary: planSummary
    };

    setMessages(prev => [...prev, newUserMsg]);
    setIsExecuting(true);
    setCurrentStage('STARTING');
    setStageMessage('Initializing OmniTask AI multi-agent swarm...');
    setFinalEvaluation(null);
    setActiveSubtask(null);

    let assignedChatId = existingChatId || currentChatId;

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          files: filesList,
          mode: 'paid',
          delivery_mode: currentDeliveryMode,
          allow_simulation: true,
          ask_before_doing: currentAskBeforeDoing,
          user_clarifications: userClarifications,
          approved_plan_summary: planSummary,
          chat_id: assignedChatId
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned error ${response.status}: ${errText || response.statusText}`);
      }

      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let executionFinished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const payload = JSON.parse(jsonStr);
              const eventName = payload.event;
              const data = payload.data;

              if (eventName === 'CHAT_SESSION_ASSIGNED') {
                assignedChatId = data.chat_id;
                setCurrentChatId(data.chat_id);
                if (data.title) setChatTitle(data.title);
                setRefreshSidebarTrigger(prev => prev + 1);
              } else if (eventName === 'HEARTBEAT') {
                if (data?.message) {
                  setStageMessage(data.message);
                }
              } else if (eventName === 'CHAT_TITLE_UPDATED') {
                if (data.title) setChatTitle(data.title);
                setRefreshSidebarTrigger(prev => prev + 1);
              } else if (eventName === 'STAGE_CHANGE') {
                setCurrentStage(data.stage);
                setStageMessage(data.message);
              } else if (eventName === 'STRUCTURING_COMPLETED') {
                setStructuredGoal(data.structured_goal);
              } else if (eventName === 'JEV_ROUTING_COMPLETED') {
                setStructuredGoal(data.routed_plan);
              } else if (eventName === 'BLACKBOARD_INITIALIZED') {
                setBlackboard({
                  session_id: data.session_id,
                  original_prompt: promptText,
                  global_prerequisites: data.prerequisites,
                  completed_outputs: {},
                  intermediate_reviews: {},
                  negative_knowledge: [],
                  audit_trail: []
                });
              } else if (eventName === 'SUBAGENT_STARTED') {
                setActiveSubtask(data);
                setCurrentStage('EXECUTING');
                setStageMessage(`Worker: ${data.assigned_worker || 'Specialist'} executing '${data.title}'...`);
              } else if (eventName === 'STEP_RETRY_INITIATED') {
                setCurrentStage('EXECUTING');
                setStageMessage(`Auto-Correction (Attempt ${data.attempt || 1}/${data.max_attempts || 5}): ${data.rejection_critique || 'Refining deliverable'}...`);
              } else if (eventName === 'STEP_MAX_RETRIES_EXCEEDED') {
                setCurrentStage('STEP_FAILED');
                setStageMessage(data.error_message || `Step failed to achieve 85% score after ${data.attempts || 5} attempts.`);
              } else if (eventName === 'INTERMEDIATE_REVIEW_COMPLETED') {
                if (data.blackboard_snapshot) {
                  setBlackboard(data.blackboard_snapshot);
                }
              } else if (eventName === 'DYNAMIC_SUBAGENT_INSERTED') {
                setCurrentStage('EXECUTING');
                setStageMessage(`Adaptive Swarm: Dynamically inserted '${data.inserted_task?.title}' (${data.reason || 'Specialist expansion'})...`);
                if (data.updated_plan) {
                  setStructuredGoal(data.updated_plan);
                }
              } else if (eventName === 'SESSION_MEMORY_UPDATED') {
                if (data.session_memory) {
                  setSessionMemory(data.session_memory);
                }
              } else if (eventName === 'CHAT_MESSAGE_COMPLETED') {
                executionFinished = true;
                // Add or update assistant message in state
                const asstMsg: ChatMessage = data.message;
                if (asstMsg.execution_data?.session_memory) {
                  setSessionMemory(asstMsg.execution_data.session_memory);
                }
                setMessages(prev => {
                  const filtered = prev.filter(m => m.id !== asstMsg.id);
                  return [...filtered, asstMsg];
                });
                setRefreshSidebarTrigger(prev => prev + 1);
              } else if (eventName === 'EXECUTION_COMPLETED') {
                executionFinished = true;
                setCurrentStage('COMPLETED');
                if (data.final_evaluation) {
                  setStageMessage(`Task execution finalized • Score: ${data.final_evaluation.overall_completion_score}%`);
                  setFinalEvaluation(data.final_evaluation);
                }
                if (data.full_blackboard_state) {
                  setBlackboard(data.full_blackboard_state);
                }
                if (data.session_memory) {
                  setSessionMemory(data.session_memory);
                }
                setActiveSubtask(null);
                setRefreshSidebarTrigger(prev => prev + 1);
              }
            } catch (e) {
              console.error('Failed to parse SSE payload', e);
            }
          }
        }
      }

      // If stream ended without explicit completion event, attempt to restore completed message from chat session
      if (!executionFinished && assignedChatId) {
        try {
          const checkRes = await fetch(`/api/chats/${assignedChatId}`);
          if (checkRes.ok) {
            const chatData: ChatSession = await checkRes.json();
            const asstMsgs = (chatData.messages || []).filter(m => m.role === 'assistant');
            if (asstMsgs.length > 0) {
              setMessages(chatData.messages);
              const lastAsst = asstMsgs[asstMsgs.length - 1];
              if (lastAsst?.execution_data) {
                setStructuredGoal(lastAsst.execution_data.structured_goal || null);
                setBlackboard(lastAsst.execution_data.blackboard_state || chatData.blackboard_state || null);
                setFinalEvaluation(lastAsst.execution_data.final_evaluation || chatData.latest_evaluation || null);
                setCurrentStage(lastAsst.execution_data.stage || 'COMPLETED');
                setStageMessage(`Task execution finalized • Score: ${lastAsst.execution_data.final_evaluation?.overall_completion_score || 95}%`);
                if (lastAsst.execution_data.session_memory) {
                  setSessionMemory(lastAsst.execution_data.session_memory);
                } else if (chatData.latest_session_memory) {
                  setSessionMemory(chatData.latest_session_memory);
                }
              }
              executionFinished = true;
            }
          }
        } catch (pollErr) {
          console.warn('Could not poll chat status after stream close', pollErr);
        }
      }
    } catch (err: any) {
      console.error('Execution error:', err);
      setCurrentStage('ERROR');
      setStageMessage(err?.message || 'Encountered an issue during execution.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Launch initial execution if prompted from landing
  useEffect(() => {
    if (initialPrompt && !initialExecutionStartedRef.current) {
      initialExecutionStartedRef.current = true;
      runExecutionTurn(initialPrompt, initialFiles, clarifications, approvedPlanSummary, initialChatId);
    } else if (initialChatId && !initialExecutionStartedRef.current) {
      initialExecutionStartedRef.current = true;
      loadChat(initialChatId);
    }
  }, [initialPrompt, initialFiles, initialChatId]);

  // Handle follow-up submission
  const handleSendMessage = () => {
    if (!inputText.trim() || isExecuting || isPlanning) return;
    const currentInput = inputText.trim();
    const currentFiles = [...attachedFiles];

    if (currentAskBeforeDoing) {
      handleFormulatePlan(currentInput, currentFiles);
    } else {
      setInputText('');
      setAttachedFiles([]);
      runExecutionTurn(currentInput, currentFiles, undefined, undefined, currentChatId);
    }
  };

  // Step 1: Formulate Implementation Plan & Clarifying Questions (Ask Before Doing)
  const handleFormulatePlan = async (taskPrompt: string, filesList: IngestedFile[]) => {
    setIsPlanning(true);
    setPendingPrompt(taskPrompt);
    setPendingFiles(filesList);
    try {
      const res = await fetch('/api/interactive-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: taskPrompt,
          files: filesList
        })
      });
      if (!res.ok) throw new Error('Failed to generate interactive plan');
      const planData: InteractivePlanResponse = await res.json();
      setInteractivePlan(planData);

      // Pre-select defaults
      const initialAnswers: Record<string, string> = {};
      if (planData.clarifying_questions) {
        planData.clarifying_questions.forEach(q => {
          initialAnswers[q.id] = q.default_selected || (q.options[0] || '');
        });
      }
      setUserAnswers(initialAnswers);
      scrollToBottom();
    } catch (err) {
      console.error('Plan formulation error:', err);
      // Fallback: execute directly if formulation fails
      setInputText('');
      setAttachedFiles([]);
      runExecutionTurn(taskPrompt, filesList, undefined, undefined, currentChatId);
    } finally {
      setIsPlanning(false);
    }
  };

  // Step 2: Approve & Execute with user answers incorporated
  const handleExecuteWithApprovedPlan = () => {
    if (!interactivePlan) return;

    const finalClarifications = { ...userAnswers };
    if (customNotes.trim()) {
      finalClarifications["Additional Custom Directives"] = customNotes.trim();
    }

    const planSummary = `Objective: ${interactivePlan.objective_summary}. Approach: ${interactivePlan.architectural_approach}. Steps: ${interactivePlan.steps.map(s => s.title).join(' -> ')}`;

    const p = pendingPrompt || inputText;
    const f = pendingFiles.length > 0 ? pendingFiles : attachedFiles;

    setInteractivePlan(null);
    setInputText('');
    setAttachedFiles([]);
    setPendingPrompt('');
    setPendingFiles([]);

    runExecutionTurn(p, f, finalClarifications, planSummary, currentChatId);
  };

  // Handle File Upload for chat follow-up
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data: IngestedFile = await res.json();
        setAttachedFiles(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const toggleTurnExpanded = (msgId: string) => {
    setExpandedTurns(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  return (
    <div className="min-h-screen bg-black text-[#ededed] flex font-['Inter',sans-serif] selection:bg-white/20 selection:text-white overflow-hidden">
      {/* Top Ambient Lighting */}
      <div className="fixed top-0 left-0 right-0 h-96 resend-radial-glow pointer-events-none z-0"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-3/4 h-px resend-top-line pointer-events-none z-0"></div>

      {/* SIDEBAR: Persistent Multi-Turn Chat Drawer */}
      <ChatSidebar
        currentChatId={currentChatId}
        onSelectChat={(id) => loadChat(id)}
        onNewChat={handleNewChat}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        refreshTrigger={refreshSidebarTrigger}
        deliveryMode={currentDeliveryMode}
        onDeliveryModeChange={(m) => setCurrentDeliveryMode(m)}
        askBeforeDoing={currentAskBeforeDoing}
        onAskBeforeDoingChange={(v) => {
          setCurrentAskBeforeDoing(v);
          if (!v) setInteractivePlan(null);
        }}
      />

      {/* MAIN CHAT WORKSPACE CANVAS */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden relative z-10">

        {/* TOP NAVIGATION BAR */}
        <header className="shrink-0 w-full border-b border-white/[0.08] bg-black/85 backdrop-blur-xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Toggle Sidebar Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-neutral-400 hover:text-white border border-white/[0.08] transition-all"
              title={isSidebarOpen ? 'Collapse Chat Sidebar' : 'Expand Chat Sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>

            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-xs font-medium text-neutral-300 hover:text-white border border-white/[0.08] transition-all group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Home</span>
            </button>

            <div className="h-5 w-px bg-white/[0.1]"></div>

            {/* Session Title & Interactive Swarm Controls */}
            <div className="flex items-center gap-3 max-w-sm sm:max-w-md md:max-w-xl truncate">
              <span className="text-sm font-medium text-white truncate">
                {chatTitle}
              </span>

              {/* Mode Segmented Controls */}
              <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentDeliveryMode('smart')}
                  disabled={isExecuting || isPlanning}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    currentDeliveryMode === 'smart' || currentDeliveryMode === 'overdeliver'
                      ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  title="Smart Mode: Overdelivers with companion assets, PDFs, and deep multi-agent reasoning"
                >
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Smart</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">Rec</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDeliveryMode('strict')}
                  disabled={isExecuting || isPlanning}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    currentDeliveryMode === 'strict'
                      ? 'bg-white/10 text-white border border-white/20 shadow-sm font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  title="Strict Mode: Executes strictly to prompt constraints without expanding scope"
                >
                  <Target className="w-3 h-3 text-neutral-300" />
                  <span>Strict</span>
                </button>
              </div>

              {/* Ask Before Doing Toggle */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !currentAskBeforeDoing;
                  setCurrentAskBeforeDoing(nextState);
                  if (!nextState) setInteractivePlan(null);
                }}
                disabled={isExecuting || isPlanning}
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-medium transition-all select-none shrink-0 ${
                  currentAskBeforeDoing
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-white/[0.02] border-white/[0.08] text-neutral-400 hover:text-neutral-200'
                }`}
                title={
                  currentAskBeforeDoing
                    ? "Ask Before Doing (Active): Asks clarifying questions and formulates implementation plan before running swarm."
                    : "Ask Before Doing (Disabled): Directly executes full autonomous pipeline in one shot without asking."
                }
              >
                <div
                  className={`w-5 h-3 rounded-full p-0.5 transition-colors flex items-center ${
                    currentAskBeforeDoing ? 'bg-emerald-500 justify-end' : 'bg-neutral-700 justify-start'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-black shadow-sm"></div>
                </div>
                <span>Ask First</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-semibold ${
                    currentAskBeforeDoing ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.06] text-neutral-400'
                  }`}
                >
                  {currentAskBeforeDoing ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Telemetry & Quick Action */}
          <div className="flex items-center gap-2.5">
            {structuredGoal && (
              <div className="hidden lg:flex items-center gap-2 bg-[#080808] px-2.5 py-1 rounded-lg border border-white/[0.08] text-[11px] font-mono">
                <span className="text-neutral-500">JEV:</span>
                <span className="text-emerald-400 font-semibold">{structuredGoal.jev_routing_latency_ms}ms</span>
              </div>
            )}

            {finalEvaluation && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Score: {finalEvaluation.overall_completion_score}%</span>
              </div>
            )}

            {/* Multi-Turn Session Memory Button */}
            <button
              onClick={() => setIsSessionMemoryModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/30 hover:border-cyan-400/50 text-cyan-300 text-xs font-mono transition-all group cursor-pointer shadow-sm"
              title="Inspect Multi-Turn Session Memory (Context RAG, Turn Grounding, & Excerpts)"
            >
              <Brain className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="hidden sm:inline">Session Memory</span>
              {sessionMemory?.active_turn_grounding ? (
                <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-semibold border border-cyan-400/30">
                  T-{sessionMemory.active_turn_grounding.matched_turn_index} ({Math.round(sessionMemory.active_turn_grounding.amplified_confidence * 100)}%)
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
              )}
            </button>

            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </header>

        {/* CHAT MESSAGES SCROLLABLE FEED */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-8 scroll-smooth">
          {isLoadingChat ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-neutral-400">Loading conversation context & deliverables...</p>
            </div>
          ) : messages.length === 0 && !isExecuting && !interactivePlan ? (
            /* Empty Chat State */
            <div className="max-w-3xl mx-auto py-12 text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto shadow-xl">
                <Sparkles className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-white tracking-tight">
                  OmniTask AI Multi-Turn Swarm
                </h2>
                <p className="text-sm text-neutral-400 max-w-lg mx-auto">
                  Execute complex tasks with persistent memory. Ask questions, request iterative modifications, or generate publication-grade deliverables.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Render Past Messages */}
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLatestTurn = index === messages.length - 1;

                if (isUser) {
                  return (
                    <div
                      key={msg.id || index}
                      className="bg-[#080808] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 mb-3 border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-indigo-300" />
                          </div>
                          <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-semibold">
                            User Directive
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <button
                          onClick={() => copyText(msg.content, msg.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white border border-white/[0.06] transition-all"
                        >
                          {copiedPromptId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-base sm:text-lg font-normal text-white leading-relaxed font-sans mb-3">
                        {msg.content}
                      </p>

                      {/* Files & Clarifications */}
                      {(msg.files && msg.files.length > 0) || (msg.clarifications && Object.keys(msg.clarifications).length > 0) ? (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.04]">
                          {msg.files && msg.files.map((f, fi) => (
                            <span
                              key={fi}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-neutral-300"
                            >
                              <Paperclip className="w-3 h-3 text-neutral-400" />
                              <span>{f.filename}</span>
                              <span className="text-neutral-500 text-[10px]">({(f.size_bytes / 1024).toFixed(1)} KB)</span>
                            </span>
                          ))}

                          {msg.clarifications && Object.entries(msg.clarifications).map(([k, v], ci) => (
                            <span
                              key={ci}
                              className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-mono"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                } else {
                  // ASSISTANT MESSAGE
                  const hasExecData = !!msg.execution_data;
                  const execData = msg.execution_data;
                  const isExpanded = expandedTurns[msg.id] ?? isLatestTurn;

                  return (
                    <div
                      key={msg.id || index}
                      className="bg-[#050505] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src="/omnitask-logo.png"
                            alt="OmniTask AI"
                            className="h-5 w-auto max-h-5 object-contain"
                            style={{ maxHeight: '20px', width: 'auto' }}
                          />
                          <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                            OmniTask Autonomous Swarm
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {execData?.final_evaluation && (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono font-medium">
                              Score: {execData.final_evaluation.overall_completion_score}%
                            </span>
                            <button
                              onClick={() => toggleTurnExpanded(msg.id)}
                              className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-all"
                              title={isExpanded ? 'Collapse Deliverables' : 'Expand Deliverables'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Multi-Turn Session Memory Grounding Badge */}
                      {execData?.session_memory?.active_turn_grounding && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSessionMemory(execData.session_memory!);
                              setIsSessionMemoryModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 hover:border-cyan-400/50 text-cyan-300 transition-all shadow-sm cursor-pointer"
                            title="Inspect Multi-Turn Session Memory grounding for this turn"
                          >
                            <Brain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>
                              {execData.session_memory.active_turn_grounding.is_immediate_preceding
                                ? `Grounded in Turn ${execData.session_memory.active_turn_grounding.matched_turn_index} (T-1)`
                                : `Waterfall Anchored: Turn ${execData.session_memory.active_turn_grounding.matched_turn_index}`}
                            </span>
                            <span className="text-cyan-400/50">&bull;</span>
                            <span className="text-emerald-300 font-semibold">
                              {Math.round(execData.session_memory.active_turn_grounding.amplified_confidence * 100)}% Match
                            </span>
                            {execData.session_memory.retrieved_excerpts && execData.session_memory.retrieved_excerpts.length > 0 && (
                              <>
                                <span className="text-cyan-400/50">&bull;</span>
                                <span className="text-cyan-200">
                                  {execData.session_memory.retrieved_excerpts.length} RAG Excerpt{execData.session_memory.retrieved_excerpts.length > 1 ? 's' : ''}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Assistant Text / Summary */}
                      <div className="prose prose-invert max-w-none text-neutral-200 text-sm sm:text-base leading-relaxed">
                        <MarkdownRenderer content={msg.content} />
                      </div>

                      {/* Expandable Execution Visualizer for past turns */}
                      {hasExecData && isExpanded && (
                        <div className="pt-4 border-t border-white/[0.06] space-y-4">
                          <LiveExecutionVisualizer
                            currentStage={execData?.stage || 'COMPLETED'}
                            stageMessage="Deliverables compiled & verified."
                            structuredGoal={execData?.structured_goal || null}
                            blackboard={execData?.blackboard_state || null}
                            activeSubtask={null}
                            finalEvaluation={execData?.final_evaluation || null}
                            isExecuting={false}
                          />
                        </div>
                      )}
                    </div>
                  );
                }
              })}

              {/* Interrupted / Incomplete Turn Recovery Banner */}
              {!isExecuting && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <div className="bg-[#120a0a] border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2.5 text-amber-400">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold">Response pending or connection disconnected</span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                    The connection closed before the final output could be rendered. You can retry the directive or check for saved deliverables.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={() => {
                        const lastMsg = messages[messages.length - 1];
                        runExecutionTurn(lastMsg.content, lastMsg.files || [], lastMsg.clarifications, lastMsg.approved_plan_summary, currentChatId);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Directive</span>
                    </button>
                    {currentChatId && (
                      <button
                        onClick={() => loadChat(currentChatId)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] text-xs font-medium transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check for Deliverables</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* CURRENT ACTIVE EXECUTION TURN (When Swarm is Running) */}
              {isExecuting && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Progress Header */}
                  <div className="bg-[#080808] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center gap-2.5">
                        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-white font-medium">{stageMessage}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-400 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                          Phase: {currentStage}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-neutral-500">Progress:</span>
                          <span className="text-indigo-400 font-semibold text-sm">{progressPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-white/[0.04] border border-white/[0.06] overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-500 ease-out rounded-full relative"
                        style={{ width: `${progressPercent}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {/* Active Visualizer */}
                  <LiveExecutionVisualizer
                    currentStage={currentStage}
                    stageMessage={stageMessage}
                    structuredGoal={structuredGoal}
                    blackboard={blackboard}
                    activeSubtask={activeSubtask}
                    finalEvaluation={finalEvaluation}
                    isExecuting={isExecuting}
                  />
                </div>
              )}

              {/* INTERACTIVE PLAN CARD (When Ask Before Doing is active and plan generated) */}
              {interactivePlan && !isExecuting && (
                <div className="animate-fadeIn">
                  <InteractivePlanCard
                    plan={interactivePlan}
                    userAnswers={userAnswers}
                    onAnswerChange={(qId, ans) => setUserAnswers(prev => ({ ...prev, [qId]: ans }))}
                    customNotes={customNotes}
                    onCustomNotesChange={setCustomNotes}
                    onApproveAndExecute={handleExecuteWithApprovedPlan}
                    onCancelOrRevise={() => {
                      setInputText(pendingPrompt);
                      setAttachedFiles(pendingFiles);
                      setInteractivePlan(null);
                      setPendingPrompt('');
                      setPendingFiles([]);
                    }}
                    isExecuting={isExecuting}
                  />
                </div>
              )}

              <div ref={feedEndRef} className="h-4"></div>
            </div>
          )}
        </div>

        {/* BOTTOM STICKY CHAT INPUT BAR */}
        <div className="shrink-0 border-t border-white/[0.08] bg-black/90 backdrop-blur-2xl p-4 sm:px-8 space-y-3 relative z-20">
          <div className="max-w-4xl mx-auto space-y-2.5">

            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {attachedFiles.map((f, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-300"
                  >
                    <Paperclip className="w-3 h-3 text-indigo-400" />
                    <span className="truncate max-w-[150px]">{f.filename}</span>
                    <button
                      onClick={() => removeAttachedFile(i)}
                      className="hover:text-red-400 p-0.5 rounded transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Textarea + Action Bar */}
            <div className="bg-[#0c0c0c] border border-white/[0.12] focus-within:border-indigo-500/50 rounded-2xl p-2 sm:p-2.5 shadow-2xl flex flex-col gap-2 transition-all">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isExecuting}
                rows={2}
                placeholder={
                  isExecuting
                    ? 'Swarm is executing task... Please wait for completion.'
                    : 'Chat with OmniTask AI... Type your instructions, modifications, or follow-up feedback'
                }
                className="w-full bg-transparent text-sm sm:text-base text-white placeholder-neutral-500 focus:outline-none resize-none px-2 py-1 leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExecuting || isUploading || isPlanning}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-xs font-mono text-neutral-400 hover:text-white border border-white/[0.06] transition-all disabled:opacity-50"
                    title="Attach reference files"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : 'Attach File'}</span>
                  </button>

                  {/* Ask Before Doing Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !currentAskBeforeDoing;
                      setCurrentAskBeforeDoing(nextState);
                      if (!nextState) setInteractivePlan(null);
                    }}
                    disabled={isExecuting || isPlanning}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all select-none ${
                      currentAskBeforeDoing
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/15'
                        : 'bg-white/[0.02] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]'
                    }`}
                    title={
                      currentAskBeforeDoing
                        ? "Ask Before Doing (Active): Analyzes objective, outlines implementation plan, and asks clarifying questions before execution."
                        : "Ask Before Doing (Disabled): Directly executes full autonomous pipeline in one shot without asking."
                    }
                  >
                    <div
                      className={`w-6 h-3.5 rounded-full p-0.5 transition-colors flex items-center ${
                        currentAskBeforeDoing ? 'bg-emerald-500 justify-end' : 'bg-neutral-700 justify-start'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-black shadow-sm"></div>
                    </div>
                    <span className="hidden sm:inline">Ask Before Doing</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-semibold ${
                        currentAskBeforeDoing ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.06] text-neutral-400'
                      }`}
                    >
                      {currentAskBeforeDoing ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {/* Mode Segmented Controls */}
                  <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCurrentDeliveryMode('smart')}
                      disabled={isExecuting || isPlanning}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${
                        currentDeliveryMode === 'smart' || currentDeliveryMode === 'overdeliver'
                          ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>Smart</span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">Rec</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentDeliveryMode('strict')}
                      disabled={isExecuting || isPlanning}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${
                        currentDeliveryMode === 'strict'
                          ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Target className="w-3 h-3 text-neutral-400" />
                      <span>Strict</span>
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-neutral-600 hidden xl:inline">
                    Enter to send &bull; Shift+Enter for new line
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isExecuting || isPlanning}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all cursor-pointer disabled:cursor-not-allowed ${
                      currentAskBeforeDoing && !interactivePlan
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20 disabled:bg-neutral-800 disabled:text-neutral-500'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 disabled:bg-neutral-800 disabled:text-neutral-500'
                    }`}
                  >
                    {isPlanning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Formulating Plan...</span>
                      </>
                    ) : isExecuting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Executing...</span>
                      </>
                    ) : currentAskBeforeDoing && !interactivePlan ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 fill-black" />
                        <span>Plan &amp; Ask</span>
                      </>
                    ) : (
                      <>
                        <span>Send</span>
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Multi-Turn Session Memory Inspector Modal */}
      <SessionMemoryModal
        isOpen={isSessionMemoryModalOpen}
        onClose={() => setIsSessionMemoryModalOpen(false)}
        sessionMemory={sessionMemory}
        chatTitle={chatTitle}
      />
    </div>
  );
};
