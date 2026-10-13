import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Compass,
  Zap,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  RotateCcw,
  AlertTriangle,
  Target
} from 'lucide-react';
import { AdvisorResponse, ToolRecommendation, DeliveryMode } from '../types';

interface AnalyzerWorkspaceProps {
  prompt: string;
  onBack: () => void;
  onRunAgain: (newPrompt: string) => void;
  onDeployToWorkerPool?: (prompt: string, deliveryMode?: DeliveryMode) => void;
  existingResult?: AdvisorResponse | null;
  initialDeliveryMode?: DeliveryMode;
}

export const AnalyzerWorkspace: React.FC<AnalyzerWorkspaceProps> = ({
  prompt,
  onBack,
  onRunAgain,
  onDeployToWorkerPool,
  existingResult = null,
  initialDeliveryMode = 'smart'
}) => {
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(existingResult?.delivery_mode || initialDeliveryMode);
  const [result, setResult] = useState<AdvisorResponse | null>(existingResult);
  const [loading, setLoading] = useState<boolean>(!existingResult);
  const [progress, setProgress] = useState<number>(existingResult ? 100 : 10);
  const [statusMessage, setStatusMessage] = useState<string>(
    existingResult ? 'Blueprint Synthesized Successfully' : 'Initializing Architectural Advisor...'
  );
  const [activeTab, setActiveTab] = useState<'all' | 'models' | 'roadmap' | 'bonus'>('all');
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);
  const [selectedPhaseMap, setSelectedPhaseMap] = useState<Record<number, number>>({});
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedUserPrompt, setCopiedUserPrompt] = useState<boolean>(false);

  // Fetch advice if not provided
  // Fetch advice if not provided or when delivery mode changes
  useEffect(() => {
    let isMounted = true;

    if (existingResult && existingResult.delivery_mode === deliveryMode) {
      setResult(existingResult);
      setLoading(false);
      setProgress(100);
      setStatusMessage('Blueprint Synthesized Successfully');
      return;
    }

    const fetchAdvice = async () => {
      setLoading(true);
      setProgress(15);
      const isSmart = deliveryMode === 'smart' || deliveryMode === 'overdeliver';
      setStatusMessage(`Parsing constraints (${isSmart ? 'Smart Mode' : 'Strict Mode'})...`);

      // Dynamic progress step timers
      const t1 = setTimeout(() => {
        if (isMounted) {
          setProgress(40);
          setStatusMessage('Evaluating matrix against 40+ onboarded AI specialist models...');
        }
      }, 350);

      const t2 = setTimeout(() => {
        if (isMounted) {
          setProgress(70);
          setStatusMessage('Decomposing task into Directed Acyclic Graph (DAG)...');
        }
      }, 700);

      const t3 = setTimeout(() => {
        if (isMounted) {
          setProgress(90);
          setStatusMessage(isSmart
            ? 'Synthesizing prompt blueprints & anticipated blind spots...'
            : 'Synthesizing concise prompt blueprints & DIY roadmap...');
        }
      }, 1050);

      try {
        const res = await fetch('/api/advisor/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, delivery_mode: deliveryMode })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: AdvisorResponse = await res.json();

        if (isMounted) {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
          setProgress(100);
          setStatusMessage(`Blueprint Synthesized Successfully (${isSmart ? '✨ Smart Mode' : '🎯 Strict Mode'})`);
          setResult(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Advisor fetch failed:', err);
        if (isMounted) {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
          setProgress(100);
          setStatusMessage('Failed to connect to advisor engine. Please retry.');
          setLoading(false);
        }
      }
    };

    fetchAdvice();

    return () => {
      isMounted = false;
    };
  }, [prompt, deliveryMode, existingResult]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptKey(key);
    setTimeout(() => setCopiedPromptKey(null), 2000);
  };

  const copyUserPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setCopiedUserPrompt(true);
    setTimeout(() => setCopiedUserPrompt(null), 2000);
  };

  const copyAllPrompts = () => {
    if (!result) return;
    const all = result.recommendations
      .map((r, i) => {
        const phasesStr = r.assigned_phases && r.assigned_phases.length > 0
          ? ` [Phases: ${r.assigned_phases.map((p) => `Phase ${p}`).join(', ')}]`
          : '';
        const promptsStr = (r.phase_prompts && r.phase_prompts.length > 0)
          ? r.phase_prompts.map((p) => `--- Phase ${p.phase} Prompt (${p.phase_title || `Phase ${p.phase}`}) ---\n${p.prompt}`).join('\n\n')
          : r.sample_prompt;
        return `=== Model ${i + 1}: ${r.tool_name} (${r.category})${phasesStr} ===\nWhy: ${r.why_recommended}\n\n${promptsStr}\n`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadStrategyMarkdown = () => {
    let md = `# OmniTask AI Architectural Blueprint
Objective: ${prompt}
Delivery Mode: ${result.delivery_mode ? result.delivery_mode.toUpperCase() : 'OVERDELIVER'}

## 1. Task Decomposition
${result.task_decomposition.map((stage, i) => `${i + 1}. ${stage}`).join('\n')}

## 2. Recommended Best-in-Class Models
${result.recommendations
  .map((r) => {
    const phasesStr = r.assigned_phases && r.assigned_phases.length > 0
      ? ` | Phases: ${r.assigned_phases.map((p) => `Phase ${p}`).join(', ')}`
      : '';
    const promptsStr = (r.phase_prompts && r.phase_prompts.length > 0)
      ? r.phase_prompts.map((p) => `#### ${p.phase_title || `Phase ${p.phase} Prompt`}\n\`\`\`\n${p.prompt}\n\`\`\``).join('\n\n')
      : `\`\`\`\n${r.sample_prompt}\n\`\`\``;
    return `### ${r.tool_name} (${r.category}${phasesStr})
- Provider: ${r.provider}
- Tier: ${r.pricing_tier}
- Rationale: ${r.why_recommended}

${promptsStr}
`;
  })
  .join('\n')}

## 3. DIY Implementation Roadmap
${result.diy_execution_blueprint
  .map(
    (b) =>
      `### Step ${b.step}: ${b.action}
- Recommended Model: ${b.recommended_tool}
- Guidance: ${b.instruction || b.input || 'Execute with recommended model'}
- Deliverable: ${b.expected_output || 'Verified artifact'}
`
  )
  .join('\n')}
`;

    if (result.anticipated_blind_spots && result.anticipated_blind_spots.length > 0) {
      md += `\n## 4. Anticipated Blind Spots & Pitfalls\n${result.anticipated_blind_spots.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OmniTask_AI_Blueprint_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-[#ededed] flex flex-col font-['Inter',sans-serif] selection:bg-white/20 selection:text-white">
      {/* Top Ambient Lighting */}
      <div className="fixed top-0 left-0 right-0 h-96 resend-radial-glow pointer-events-none z-0"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-3/4 h-px resend-top-line pointer-events-none z-0"></div>

      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-black/85 backdrop-blur-xl px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-xs font-medium text-neutral-300 hover:text-white border border-white/[0.08] transition-all group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Prompts</span>
          </button>

          <div className="h-5 w-px bg-white/[0.1] hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <img src="/omnitask-logo.png" alt="OmniTask AI" className="h-5 w-auto object-contain" />
            <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Track 1 &bull; Architectural Blueprint
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Mode Selector Pill */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] gap-1">
            <button
              type="button"
              onClick={() => {
                if (deliveryMode !== 'smart' && deliveryMode !== 'overdeliver') {
                  setDeliveryMode('smart');
                  setResult(null);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                deliveryMode === 'smart' || deliveryMode === 'overdeliver'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Smart Mode</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (deliveryMode !== 'strict') {
                  setDeliveryMode('strict');
                  setResult(null);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                deliveryMode === 'strict'
                  ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Target className="w-3 h-3 text-neutral-400" />
              <span>Strict</span>
            </button>
          </div>

          {result && (
            <>
              <button
                onClick={copyAllPrompts}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] text-xs transition-all"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? 'Copied All!' : 'Copy All Prompts'}</span>
              </button>

              <button
                onClick={downloadStrategyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] text-xs transition-all"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Export Plan (.md)</span>
              </button>
            </>
          )}

          {onDeployToWorkerPool && (
            <button
              onClick={() => onDeployToWorkerPool(prompt, deliveryMode)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-all shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 text-black" />
              <span>Deploy in Swarm (Track 2)</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTENT AREA: Expansive Wide Canvas */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8 relative z-10">
        
        {/* =========================================================================
            SECTION 1: USER'S SUBMITTED PROMPT (Prominent & Clear)
           ========================================================================= */}
        <div className="bg-[#080808] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                Your Submitted Objective
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyUserPrompt}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white border border-white/[0.06] transition-all"
              >
                {copiedUserPrompt ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Prompt</span>
                  </>
                )}
              </button>

              <button
                onClick={onBack}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white border border-white/[0.06] transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Edit / New</span>
              </button>
            </div>
          </div>

          <p className="text-base sm:text-lg font-normal text-white leading-relaxed font-sans">
            &ldquo;{prompt}&rdquo;
          </p>
        </div>

        {/* =========================================================================
            SECTION 2: ACCURATE PROGRESS BAR & REAL-TIME STATUS
           ========================================================================= */}
        <div className="bg-[#080808] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2.5">
              {loading ? (
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span className="text-white font-medium">{statusMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">Progress</span>
              <span className="text-emerald-400 font-semibold">{progress}%</span>
            </div>
          </div>

          {/* Progress Track */}
          <div className="w-full h-2 rounded-full bg-white/[0.04] border border-white/[0.06] overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 transition-all duration-500 ease-out rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              {loading && (
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 3: BIG, EXPANSIVE OUTPUT AREA (NOT a small window!)
           ========================================================================= */}
        {result && (
          <div className="space-y-8 animate-fadeIn">
            {/* View Selector Tabs */}
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'all'
                    ? 'bg-white text-black font-semibold shadow-md'
                    : 'text-neutral-400 hover:text-white bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Full Blueprint Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('models')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'models'
                    ? 'bg-white text-black font-semibold shadow-md'
                    : 'text-neutral-400 hover:text-white bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Prescribed Models & Prompts ({result.recommendations.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('roadmap')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'roadmap'
                    ? 'bg-white text-black font-semibold shadow-md'
                    : 'text-neutral-400 hover:text-white bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Milestone Roadmap ({result.diy_execution_blueprint.length} Steps)</span>
              </button>

              {(result.delivery_mode === 'smart' || result.delivery_mode === 'overdeliver') &&
               result.anticipated_blind_spots && result.anticipated_blind_spots.length > 0 && (
                <button
                  onClick={() => setActiveTab('bonus')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                    activeTab === 'bonus'
                      ? 'bg-amber-400 text-black font-semibold shadow-md'
                      : 'text-amber-300 hover:text-white bg-amber-500/10 border border-amber-500/20'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Anticipated Blind Spots</span>
                </button>
              )}
            </div>

            {/* TAB CONTENT: ALL OR DECOMPOSITION */}
            {(activeTab === 'all' || activeTab === 'roadmap') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-mono">
                      01
                    </span>
                    <span>Sequential Task Decomposition</span>
                  </h3>
                  <span className="text-xs text-neutral-500 font-mono">
                    {result.task_decomposition.length} Structured Phases
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {result.task_decomposition.map((stage, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#080808] border border-white/[0.08] hover:border-emerald-500/30 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.04] text-neutral-400 border border-white/[0.06]">
                          Phase {idx + 1}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
                      </div>
                      <p className="text-xs font-medium text-neutral-200 leading-relaxed font-sans">
                        {stage}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: PRESCRIBED MODELS (BIG, EXPANSIVE CARDS) */}
            {(activeTab === 'all' || activeTab === 'models') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-mono">
                      02
                    </span>
                    <span>Prescribed Best-in-Class Models & Ready-to-Use Prompts</span>
                  </h3>
                  <span className="text-xs text-neutral-500 font-mono">Domain matched from 40+ catalog</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {result.recommendations.map((rec, idx) => {
                    const activePromptIdx = selectedPhaseMap[idx] ?? 0;
                    const activePrompt =
                      rec.phase_prompts && rec.phase_prompts.length > activePromptIdx
                        ? rec.phase_prompts[activePromptIdx]
                        : { phase: rec.assigned_phases?.[0] ?? 1, prompt: rec.sample_prompt, phase_title: '' };
                    const promptKey = `${idx}-${activePromptIdx}`;

                    return (
                      <div
                        key={idx}
                        className="bg-[#080808] border border-white/[0.08] hover:border-white/[0.18] rounded-2xl p-6 space-y-4 transition-all flex flex-col justify-between shadow-xl"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-medium">
                                {rec.category}
                              </span>
                              <h4 className="text-lg font-medium text-white">
                                {rec.tool_name}
                              </h4>
                              <p className="text-xs text-neutral-500 font-mono">{rec.provider}</p>

                              {/* Phase Badges */}
                              {rec.assigned_phases && rec.assigned_phases.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {rec.assigned_phases.map((ph) => (
                                    <span
                                      key={ph}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-semibold"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                      Phase {ph}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-white/[0.1] bg-white/[0.03] text-neutral-300 shrink-0">
                              {rec.pricing_tier}
                            </span>
                          </div>

                          <p className="text-xs text-neutral-300 leading-relaxed">
                            {rec.description}
                          </p>

                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-neutral-300 flex items-start gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                              <strong className="text-white">Why Selected: </strong>
                              {rec.why_recommended}
                            </span>
                          </div>
                        </div>

                        {/* Phase Prompts Section */}
                        <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                          {/* Multi-phase Tabs if tool spans multiple phases */}
                          {rec.phase_prompts && rec.phase_prompts.length > 1 && (
                            <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-x-auto">
                              {rec.phase_prompts.map((pp, pIdx) => {
                                const isSelected = activePromptIdx === pIdx;
                                return (
                                  <button
                                    key={pIdx}
                                    onClick={() =>
                                      setSelectedPhaseMap((prev) => ({ ...prev, [idx]: pIdx }))
                                    }
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all shrink-0 flex items-center gap-1.5 ${
                                      isSelected
                                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                                        : 'text-neutral-400 hover:text-white'
                                    }`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    <span>Phase {pp.phase} Prompt</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] text-neutral-400 font-semibold">
                                {rec.phase_prompts && rec.phase_prompts.length > 1
                                  ? `Phase ${activePrompt.phase} Ready Prompt`
                                  : (activePrompt.phase ? `Phase ${activePrompt.phase} Ready Prompt` : 'Ready-to-use Prompt')}
                              </span>
                              {activePrompt.phase_title && (
                                <span className="text-[11px] text-neutral-500 hidden sm:inline truncate max-w-[200px]">
                                  &bull; {activePrompt.phase_title.includes(':') ? activePrompt.phase_title.split(':')[1]?.trim() : activePrompt.phase_title}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => copyToClipboard(activePrompt.prompt, promptKey)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-xs text-white border border-white/[0.08] transition-all"
                            >
                              {copiedPromptKey === promptKey ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Prompt</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#030303] border border-white/[0.06] font-mono text-xs text-neutral-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-all selection:bg-emerald-500/30">
                            {activePrompt.prompt}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT: DIY EXECUTION ROADMAP */}
            {(activeTab === 'all' || activeTab === 'roadmap') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-mono">
                      03
                    </span>
                    <span>DIY Execution Roadmap & Deliverables</span>
                  </h3>
                  <span className="text-xs text-neutral-500 font-mono">Self-guided execution path</span>
                </div>

                <div className="space-y-3">
                  {result.diy_execution_blueprint.map((blueprint, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] hover:border-white/[0.15] transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-md bg-white/[0.06] text-white flex items-center justify-center text-xs font-mono font-semibold">
                            {blueprint.step}
                          </span>
                          <h4 className="text-sm font-semibold text-white font-sans">
                            {blueprint.action}
                          </h4>
                        </div>
                        <span className="text-xs font-mono text-emerald-400 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          Model: {blueprint.recommended_tool}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-3 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1">
                          <span className="text-neutral-500 font-mono uppercase text-[10px] block">Execution Guidance:</span>
                          <p className="text-neutral-300 font-sans leading-relaxed">{blueprint.instruction || blueprint.input || 'Execute with recommended model'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1">
                          <span className="text-neutral-500 font-mono uppercase text-[10px] block">Expected Deliverable:</span>
                          <p className="text-emerald-300 font-sans leading-relaxed">{blueprint.expected_output || 'Production verified output artifact'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: ANTICIPATED BLIND SPOTS */}
            {(activeTab === 'all' || activeTab === 'bonus') && (result.delivery_mode === 'smart' || result.delivery_mode === 'overdeliver') && (
              <div className="space-y-8">
                {/* 04: ANTICIPATED BLIND SPOTS */}
                {result.anticipated_blind_spots && result.anticipated_blind_spots.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-xs font-mono">
                          04
                        </span>
                        <span>Anticipated Blind Spots & Gotchas (What You Didn't Know to Ask)</span>
                      </h3>
                      <span className="text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded">
                        Proactive Advisory
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {result.anticipated_blind_spots.map((spot, sIdx) => {
                        const parts = spot.split(': ');
                        const title = parts.length > 1 ? parts[0] : `Critical Consideration ${sIdx + 1}`;
                        const body = parts.length > 1 ? parts.slice(1).join(': ') : spot;
                        return (
                          <div
                            key={sIdx}
                            className="p-4 rounded-xl bg-[#080808] border border-amber-500/20 hover:border-amber-500/40 transition-all flex items-start gap-3"
                          >
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h5 className="text-xs font-semibold text-amber-200">{title}</h5>
                              <p className="text-xs text-neutral-300 leading-relaxed font-sans">{body}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Call to Action Bar */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/20 via-[#0a0a0a] to-indigo-950/20 border border-white/[0.1] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white">Want OmniTask AI to execute this autonomously?</h4>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Hand off this blueprint to Track 2 for live code synthesis, image rendering, and QA verification.
                </p>
              </div>

              {onDeployToWorkerPool && (
                <button
                  onClick={() => onDeployToWorkerPool(prompt, deliveryMode)}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-all flex items-center gap-2 shrink-0 shadow-lg"
                >
                  <Zap className="w-4 h-4 text-black" />
                  <span>Execute in Swarm Now</span>
                </button>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
};
