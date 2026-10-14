import React, { useState } from 'react';
import {
  Brain,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  X,
  FileText,
  Search,
  Zap,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import { SessionMemoryState, SessionMemoryExcerpt } from '../types';

interface SessionMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionMemory: SessionMemoryState | null;
  chatTitle?: string;
}

export const SessionMemoryModal: React.FC<SessionMemoryModalProps> = ({
  isOpen,
  onClose,
  sessionMemory,
  chatTitle = 'Autonomous Swarm Session'
}) => {
  const [activeTab, setActiveTab] = useState<'grounding' | 'excerpts' | 'compressed' | 'scope'>('grounding');
  const [expandedExcerptIdx, setExpandedExcerptIdx] = useState<number | null>(0);

  if (!isOpen) return null;

  const grounding = sessionMemory?.active_turn_grounding;
  const excerpts = sessionMemory?.retrieved_excerpts || [];
  const compressed = sessionMemory?.compressed_history || '';
  const totalChunks = sessionMemory?.total_indexed_chunks || 0;
  const hasPriorContext = sessionMemory?.has_prior_context ?? false;

  const amplifiedPct = grounding ? Math.round(grounding.amplified_confidence * 100) : 0;
  const rawPct = grounding ? Math.round(grounding.raw_confidence * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 font-['Inter',sans-serif]">
      <div className="bg-[#090b10] border border-cyan-500/30 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-cyan-500/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Multi-Turn Session Memory
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  Active Chat Context
                </span>
                {hasPriorContext && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Grounded
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-md">
                {chatTitle} &bull; <span className="text-neutral-500 font-mono">Scoped strictly to this conversation</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-white/[0.06] bg-black/40 flex items-center gap-1 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('grounding')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'grounding'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Turn Grounding & Waterfall</span>
            {grounding && (
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px]">
                {amplifiedPct}%
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('excerpts')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'excerpts'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Retrieved RAG Excerpts</span>
            <span className="px-1.5 py-0.2 rounded bg-white/[0.08] text-neutral-300 text-[10px]">
              {excerpts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('compressed')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'compressed'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Compressed History</span>
            {compressed && (
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('scope')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'scope'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Memory Scope & Privacy</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 flex-1">
          {/* TAB 1: GROUNDING & WATERFALL */}
          {activeTab === 'grounding' && (
            <div className="space-y-5">
              {!hasPriorContext && !grounding ? (
                <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
                  <Info className="w-8 h-8 text-neutral-500 mx-auto" />
                  <p className="text-sm font-medium text-neutral-300">Turn 1 (Initial Directive)</p>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    This is the starting turn of this chat session. As you send follow-up questions or modification directives, Multi-Turn Session Memory will automatically track preceding deliverables, execute backward waterfall matching, and apply Dynamic Contrast Amplification.
                  </p>
                </div>
              ) : (
                <>
                  {/* Grounding Status Card */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/30 to-black border border-cyan-500/25 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                          Target Deliverable Anchor
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                          {grounding?.is_immediate_preceding ? 'Immediate Preceding Turn (T-1)' : `Backward Waterfall (Turn ${grounding?.matched_turn_index})`}
                        </span>
                      </div>
                      <span className="text-emerald-400 font-mono font-bold text-sm">
                        {amplifiedPct}% Amplified Match
                      </span>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {grounding?.is_immediate_preceding
                        ? `The multi-turn orchestrator resolved Turn ${grounding?.matched_turn_index} as the direct anchor for your latest instruction. Context from this deliverable was injected into the prompt to preserve continuity.`
                        : `Backward waterfall matching evaluated candidate deliverables in reverse order and resolved that your directive specifically targets the earlier deliverable from Turn ${grounding?.matched_turn_index}. Dynamic Contrast Amplification cleanly separated this turn from subsequent turns.`}
                    </p>

                    {/* Visual Meter */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                        <span>Dynamic Contrast Confidence</span>
                        <span className="text-cyan-300">{amplifiedPct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-900 border border-white/[0.08] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(10, amplifiedPct))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Math Breakdown: Contrast Amplification */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
                      <span className="text-[11px] font-mono uppercase text-neutral-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        Raw Affinity vs Amplified
                      </span>
                      <div className="flex items-baseline gap-3 pt-1">
                        <div>
                          <span className="text-[10px] text-neutral-500 font-mono block">RAW SCORE</span>
                          <span className="text-sm font-mono text-neutral-300 font-semibold">{rawPct}%</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-cyan-400" />
                        <div>
                          <span className="text-[10px] text-cyan-400 font-mono block">DYNAMIC CONTRAST</span>
                          <span className="text-sm font-mono text-emerald-400 font-bold">{amplifiedPct}%</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-neutral-500 leading-normal pt-1">
                        Mathematical inverse compression magnifies minute differences into decisive separation.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
                      <span className="text-[11px] font-mono uppercase text-neutral-400 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-cyan-400" />
                        Chat Storage Index
                      </span>
                      <div className="flex items-baseline gap-3 pt-1">
                        <div>
                          <span className="text-[10px] text-neutral-500 font-mono block">INDEXED CHUNKS</span>
                          <span className="text-sm font-mono text-white font-semibold">{totalChunks || excerpts.length || 6}</span>
                        </div>
                        <span className="text-neutral-600">&bull;</span>
                        <div>
                          <span className="text-[10px] text-neutral-500 font-mono block">RAG MATCHES</span>
                          <span className="text-sm font-mono text-cyan-300 font-semibold">{excerpts.length}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-neutral-500 leading-normal pt-1">
                        Real-time TF-IDF lexical + semantic indexing across all turns in this session.
                      </p>
                    </div>
                  </div>

                  {/* Candidate Turns Comparison */}
                  {grounding?.candidates_summary && grounding.candidates_summary.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                        <span>Candidate Deliverables Ranked</span>
                        <span className="text-[10px] text-neutral-500">({grounding.candidates_summary.length})</span>
                      </h4>
                      <div className="space-y-1.5">
                        {grounding.candidates_summary.map((cand, ci) => (
                          <div
                            key={ci}
                            className={`flex items-center justify-between p-2.5 rounded-lg border font-mono text-xs ${
                              cand.turn_index === grounding.matched_turn_index
                                ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                                : 'bg-black/30 border-white/[0.06] text-neutral-400'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {cand.turn_index === grounding.matched_turn_index ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-neutral-600 flex items-center justify-center text-[9px] text-neutral-500">
                                  {ci + 1}
                                </span>
                              )}
                              <span>Turn {cand.turn_index} Deliverable</span>
                              {cand.turn_index === grounding.matched_turn_index && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                                  MATCHED
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-[11px]">
                              <span>Raw: {Math.round(cand.raw * 100)}%</span>
                              <span className="text-emerald-400 font-semibold">
                                Amplified: {Math.round(cand.amplified * 100)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: RETRIEVED RAG EXCERPTS */}
          {activeTab === 'excerpts' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-2.5 text-neutral-400">
                <Search className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  The Chat Storage RAG engine divides previous assistant deliverables and user instructions into semantic chunks. When you reference a past point, topic, or question, these verified excerpts are automatically retrieved and injected into the structurer and workers.
                </p>
              </div>

              {excerpts.length === 0 ? (
                <div className="p-6 rounded-xl bg-black/20 border border-white/[0.04] text-center text-neutral-500 italic">
                  No historical excerpts needed for this turn (current context was fully covered by the active deliverable).
                </div>
              ) : (
                <div className="space-y-2.5">
                  {excerpts.map((item, idx) => {
                    const isExpanded = expandedExcerptIdx === idx;
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-white/[0.08] bg-black/40 overflow-hidden transition-all"
                      >
                        <button
                          onClick={() => setExpandedExcerptIdx(isExpanded ? null : idx)}
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-mono text-[10px]">
                              Turn {item.turn_index} ({item.role})
                            </span>
                            <span className="text-xs font-medium text-white truncate max-w-md">
                              {item.heading}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              Score: {item.score}
                            </span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-3.5 pt-1 border-t border-white/[0.04] text-neutral-300 bg-black/60">
                            <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words text-neutral-300 p-2.5 rounded-lg bg-black border border-white/[0.04]">
                              {item.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMPRESSED EARLIER HISTORY */}
          {activeTab === 'compressed' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-2.5 text-neutral-400">
                <Layers className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  As conversations grow beyond 3 turns, older turns ($T-2 \dots T-N$) are automatically compressed into dense architectural summaries. This preserves 100% of historical decisions while completely eliminating prompt token bloat.
                </p>
              </div>

              {compressed ? (
                <div className="p-4 rounded-xl bg-black/50 border border-white/[0.08] space-y-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 block">
                    Active High-Density Summary
                  </span>
                  <pre className="text-xs font-mono text-neutral-200 leading-relaxed whitespace-pre-wrap">
                    {compressed}
                  </pre>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-black/20 border border-white/[0.04] text-center text-neutral-500 italic">
                  Conversation has not yet exceeded compression threshold (all active turns are currently preserved in full fidelity).
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ARCHITECTURE & MEMORY SCOPE */}
          {activeTab === 'scope' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/25 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                    Strict Memory Boundaries
                  </span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  OmniTask AI implements an airtight separation between task-specific session memory and global persistent memory:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Session Memory Box */}
                <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/30 space-y-2">
                  <span className="text-xs font-mono font-semibold text-cyan-300 flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-cyan-400" />
                    Multi-Turn Session Memory
                  </span>
                  <p className="text-[11px] text-neutral-400">
                    <span className="text-white font-medium">Lifecycle:</span> Scoped ONLY to this conversation.
                  </p>
                  <ul className="text-[11px] text-neutral-400 space-y-1 list-disc pl-4 pt-1">
                    <li>Syllabus units & exam question types</li>
                    <li>File formats (docx, pdf, answer keys)</li>
                    <li>Assignment parameters & difficulty</li>
                    <li>Backward waterfall deliverable anchors</li>
                    <li>Exact semantic RAG excerpts from past turns</li>
                  </ul>
                </div>

                {/* Global Persistent Memory Box */}
                <div className="p-4 rounded-xl bg-black/40 border border-purple-500/30 space-y-2">
                  <span className="text-xs font-mono font-semibold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Global Persistent Memory
                  </span>
                  <p className="text-[11px] text-neutral-400">
                    <span className="text-white font-medium">Lifecycle:</span> Shared across ALL chats.
                  </p>
                  <ul className="text-[11px] text-neutral-400 space-y-1 list-disc pl-4 pt-1">
                    <li><strong className="text-purple-300">Updates strictly once</strong> when a new chat starts</li>
                    <li>User business ownership & profession</li>
                    <li>Permanent operational rules (e.g. no day-wise plans)</li>
                    <li><span className="text-rose-400">Never stores</span> syllabus, task questions, or doc/pdf formats</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.08] bg-black/40 flex items-center justify-between">
          <span className="text-[11px] font-mono text-neutral-500">
            OmniTask Context Engine v2.0 &bull; Dynamic Contrast RAG
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-neutral-200 text-xs font-medium transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
