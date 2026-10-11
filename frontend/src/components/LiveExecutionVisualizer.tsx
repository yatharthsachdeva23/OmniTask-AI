import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Code2,
  Calculator,
  Image as ImageIcon,
  Video,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Download,
  AlertCircle,
  Gift,
  Music,
  CheckSquare,
  Target,
  FileText
} from 'lucide-react';
import {
  StructuredGoal,
  BlackboardSnapshot,
  FinalEvaluationResult,
  StructuredSubTask,
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface LiveExecutionVisualizerProps {
  currentStage: string;
  stageMessage: string;
  structuredGoal: StructuredGoal | null;
  blackboard: BlackboardSnapshot | null;
  activeSubtask: StructuredSubTask | null;
  finalEvaluation: FinalEvaluationResult | null;
  isExecuting: boolean;
}

interface FileDownloadInfo {
  filename: string;
  content: string;
  mimeType: string;
  isImage?: boolean;
  imageUrl?: string;
  isPdf?: boolean;
  pdfUrl?: string;
  isDocx?: boolean;
  docxUrl?: string;
  docxAnswerKeyUrl?: string;
  docxAnswerKeyFilename?: string;
  pdfAnswerKeyUrl?: string;
  pdfAnswerKeyFilename?: string;
  isVideo?: boolean;
  videoUrl?: string;
  isAudio?: boolean;
  audioUrl?: string;
  extension: string;
}

export const sanitizeDisplayOutput = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/<\s*(?:agent[-_]?)?handover\s*>[\s\S]*?(?:<\s*\/?\s*(?:agent[-_]?)?handover\s*>|$)/gi, '')
    .replace(/<\s*\/?\s*(?:agent[-_]?)?handover\s*>/gi, '')
    .replace(/<\s*secret[-_]?answer\s*>[\s\S]*?(?:<\s*\/?\s*secret[-_]?answer\s*>|$)/gi, '')
    .replace(/<\s*\/?\s*secret[-_]?answer\s*>/gi, '')
    .replace(/<!--\s*(?:AGENT_HANDOVER|INTERNAL_DIRECTIVE|DOWNSTREAM_INSTRUCTIONS):[\s\S]*?-->/gi, '')
    .trim();
};

const parseDeliverableFile = (
  title: string,
  rawText: string,
  domain: string,
  artifacts?: Record<string, any>
): FileDownloadInfo => {
  const text = sanitizeDisplayOutput(rawText);
  const safeName =
    title
      .toLowerCase()
      .replace(/^(modular implementation & architecture for|web & ui implementation for|visual asset render for|compose creative poem for|execution & synthesis of|in-depth synthesis & deliverable generation for|in-depth question answering & solutions for)\s*/i, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'deliverable';

  // 1. Check for Word (.docx) document asset from artifacts OR rawText
  const docxMarkdownMatches = Array.from(rawText.matchAll(/\[([^\]]*)\]\(([^)]+\.docx)\)/gi));
  const docxUrlMatches = Array.from(rawText.matchAll(/(?:href=["']|\b)(\/api\/generated-media\/[a-zA-Z0-9_\-]+\.docx)/gi));

  let detectedDocxUrl =
    artifacts?.docx_url ||
    artifacts?.download_url ||
    (artifacts?.filename?.toLowerCase().endsWith('.docx') ? `/api/generated-media/${artifacts.filename}` : undefined);
  let detectedDocxFilename = artifacts?.docx_filename || (artifacts?.filename?.toLowerCase().endsWith('.docx') ? artifacts.filename : undefined);
  let detectedDocxAnswerKeyUrl = artifacts?.docx_answer_key_url;
  let detectedDocxAnswerKeyFilename = artifacts?.docx_answer_key_filename;

  if (!detectedDocxUrl) {
    if (docxMarkdownMatches.length > 0) {
      for (const m of docxMarkdownMatches) {
        const linkText = m[1].toLowerCase();
        const linkUrl = m[2];
        const fname = linkUrl.split('/').pop()?.split('?')[0] || 'document.docx';
        if (linkText.includes('answer') || linkText.includes('key') || linkText.includes('solution') || fname.toLowerCase().includes('answer')) {
          detectedDocxAnswerKeyUrl = linkUrl;
          detectedDocxAnswerKeyFilename = fname;
        } else if (!detectedDocxUrl) {
          detectedDocxUrl = linkUrl;
          detectedDocxFilename = fname;
        }
      }
      if (!detectedDocxUrl && docxMarkdownMatches[0]) {
        detectedDocxUrl = docxMarkdownMatches[0][2];
        detectedDocxFilename = detectedDocxUrl.split('/').pop()?.split('?')[0] || 'document.docx';
      }
    } else if (docxUrlMatches.length > 0) {
      detectedDocxUrl = docxUrlMatches[0][1];
      detectedDocxFilename = detectedDocxUrl.split('/').pop()?.split('?')[0] || 'document.docx';
      if (docxUrlMatches.length > 1) {
        detectedDocxAnswerKeyUrl = docxUrlMatches[1][1];
        detectedDocxAnswerKeyFilename = detectedDocxAnswerKeyUrl.split('/').pop()?.split('?')[0] || 'Answer_Key.docx';
      }
    }
  }

  // Also check for PDF links in rawText if pdf_url is missing
  let detectedPdfUrl = artifacts?.pdf_url;
  let detectedPdfFilename = artifacts?.pdf_filename;
  let detectedPdfAnswerKeyUrl = artifacts?.pdf_answer_key_url;
  let detectedPdfAnswerKeyFilename = artifacts?.pdf_answer_key_filename;

  if (!detectedPdfUrl) {
    const pdfMarkdownMatches = Array.from(rawText.matchAll(/\[([^\]]*)\]\(([^)]+\.pdf)\)/gi));
    for (const m of pdfMarkdownMatches) {
      const linkText = m[1].toLowerCase();
      const linkUrl = m[2];
      const fname = linkUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
      if (linkText.includes('answer') || linkText.includes('key') || linkText.includes('solution') || fname.toLowerCase().includes('answer')) {
        detectedPdfAnswerKeyUrl = linkUrl;
        detectedPdfAnswerKeyFilename = fname;
      } else if (!detectedPdfUrl) {
        detectedPdfUrl = linkUrl;
        detectedPdfFilename = fname;
      }
    }
  }

  const isDocxFile = Boolean(
    detectedDocxUrl ||
    artifacts?.has_docx ||
    (artifacts?.filename && artifacts.filename.toLowerCase().endsWith('.docx')) ||
    (artifacts?.docx_filename && artifacts.docx_filename.toLowerCase().endsWith('.docx'))
  );

  if (isDocxFile) {
    return {
      filename: detectedDocxFilename || artifacts?.docx_filename || artifacts?.filename || `${safeName}.docx`,
      content: '',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      isDocx: true,
      docxUrl: detectedDocxUrl,
      docxAnswerKeyUrl: detectedDocxAnswerKeyUrl,
      docxAnswerKeyFilename: detectedDocxAnswerKeyFilename,
      isPdf: Boolean(detectedPdfUrl),
      pdfUrl: detectedPdfUrl,
      pdfAnswerKeyUrl: detectedPdfAnswerKeyUrl,
      pdfAnswerKeyFilename: detectedPdfAnswerKeyFilename,
      extension: 'DOCX',
    };
  }

  // 2. Check for PDF document asset
  if (detectedPdfUrl || artifacts?.pdf_url) {
    return {
      filename: artifacts?.filename || artifacts?.pdf_filename || detectedPdfFilename || `${safeName}.pdf`,
      content: '',
      mimeType: 'application/pdf',
      isPdf: true,
      pdfUrl: detectedPdfUrl || artifacts?.pdf_url,
      pdfAnswerKeyUrl: detectedPdfAnswerKeyUrl || artifacts?.pdf_answer_key_url,
      pdfAnswerKeyFilename: detectedPdfAnswerKeyFilename || artifacts?.pdf_answer_key_filename,
      extension: 'PDF',
    };
  }

  // 2. Check for Video asset
  if (artifacts?.video_url) {
    return {
      filename: artifacts.filename || `${safeName}.mp4`,
      content: '',
      mimeType: 'video/mp4',
      isVideo: true,
      videoUrl: artifacts.video_url,
      extension: 'MP4',
    };
  }

  // 3. Check for Audio track
  if (artifacts?.audio_url) {
    const isWav = artifacts.audio_url.endsWith('.wav');
    return {
      filename: artifacts.filename || `${safeName}.${isWav ? 'wav' : 'mp3'}`,
      content: '',
      mimeType: isWav ? 'audio/wav' : 'audio/mpeg',
      isAudio: true,
      audioUrl: artifacts.audio_url,
      extension: isWav ? 'WAV' : 'MP3',
    };
  }

  // 4. Check for Image asset
  if (artifacts?.image_url) {
    return {
      filename: `${safeName}.jpg`,
      content: '',
      mimeType: 'image/jpeg',
      isImage: true,
      imageUrl: artifacts.image_url,
      extension: 'JPG',
    };
  }

  // 5. Check for fenced code blocks
  const codeMatch = text.match(/```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/);
  if (codeMatch) {
    const lang = (codeMatch[1] || '').toLowerCase().trim();
    const codeContent = codeMatch[2].trim();

    if (lang === 'html' || lang === 'htm' || codeContent.toLowerCase().includes('<!doctype') || codeContent.toLowerCase().includes('<html')) {
      return {
        filename: `${safeName}.html`,
        content: codeContent,
        mimeType: 'text/html',
        extension: 'HTML',
      };
    }
    if (lang === 'css') {
      return {
        filename: `${safeName}.css`,
        content: codeContent,
        mimeType: 'text/css',
        extension: 'CSS',
      };
    }
    if (lang === 'python' || lang === 'py') {
      return {
        filename: `${safeName}.py`,
        content: codeContent,
        mimeType: 'text/x-python',
        extension: 'PY',
      };
    }
    if (lang === 'javascript' || lang === 'js') {
      return {
        filename: `${safeName}.js`,
        content: codeContent,
        mimeType: 'application/javascript',
        extension: 'JS',
      };
    }
    if (lang === 'typescript' || lang === 'ts') {
      return {
        filename: `${safeName}.ts`,
        content: codeContent,
        mimeType: 'application/typescript',
        extension: 'TS',
      };
    }
    if (lang === 'sql') {
      return {
        filename: `${safeName}.sql`,
        content: codeContent,
        mimeType: 'application/sql',
        extension: 'SQL',
      };
    }
    if (lang === 'json') {
      return {
        filename: `${safeName}.json`,
        content: codeContent,
        mimeType: 'application/json',
        extension: 'JSON',
      };
    }
    const ext = lang ? lang.toUpperCase() : 'TXT';
    return {
      filename: `${safeName}.${lang || 'txt'}`,
      content: codeContent,
      mimeType: 'text/plain',
      extension: ext,
    };
  }

  // 3. Fallback: Markdown document or plain text
  const isMarkdown = text.includes('#') || text.includes('**') || text.includes('\n- ') || domain === 'audit' || domain === 'math';
  return {
    filename: `${safeName}.${isMarkdown ? 'md' : 'txt'}`,
    content: text,
    mimeType: isMarkdown ? 'text/markdown' : 'text/plain',
    extension: isMarkdown ? 'MD' : 'TXT',
  };
};

export const LiveExecutionVisualizer: React.FC<LiveExecutionVisualizerProps> = ({
  currentStage,
  stageMessage,
  structuredGoal,
  blackboard,
  activeSubtask,
  finalEvaluation,
  isExecuting
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'blackboard' | 'deliverables'>('timeline');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rawViewSteps, setRawViewSteps] = useState<Record<string, boolean>>({});

  const handleCopy = (key: string, text: string) => {
    const codeMatch = text.match(/```(?:[a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/);
    const textToCopy = codeMatch ? codeMatch[1].trim() : text;
    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const handleDownload = async (fileInfo: FileDownloadInfo, specificUrl?: string, specificFilename?: string) => {
    const binaryUrl = specificUrl || fileInfo.docxUrl || fileInfo.pdfUrl || fileInfo.videoUrl || fileInfo.audioUrl || fileInfo.imageUrl;
    const downloadFilename = specificFilename || (specificUrl ? specificUrl.split('/').pop() : fileInfo.filename);
    if (binaryUrl) {
      try {
        const response = await fetch(binaryUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFilename || 'deliverable';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch {
        const a = document.createElement('a');
        a.href = binaryUrl;
        a.download = downloadFilename || 'deliverable';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      return;
    }

    const blob = new Blob([fileInfo.content], { type: fileInfo.mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInfo.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getDomainIcon = (domain: string) => {
    switch (domain.toLowerCase()) {
      case 'math':
        return <Calculator className="w-3.5 h-3.5 text-neutral-300" />;
      case 'code':
        return <Code2 className="w-3.5 h-3.5 text-neutral-300" />;
      case 'vision':
        return <ImageIcon className="w-3.5 h-3.5 text-neutral-300" />;
      case 'video':
        return <Video className="w-3.5 h-3.5 text-neutral-300" />;
      default:
        return <FileCheck className="w-3.5 h-3.5 text-neutral-300" />;
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  return (
    <div className="space-y-6">
      {/* Real-time Status Header */}
      <div className="p-4 rounded-2xl bg-[#080808] border border-white/[0.08] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white">
            {currentStage === 'STEP_FAILED' || currentStage === 'ERROR' ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : isExecuting ? (
              <Zap className="w-4 h-4 text-white animate-pulse" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono uppercase tracking-wider ${currentStage === 'STEP_FAILED' || currentStage === 'ERROR' ? 'text-red-400' : 'text-neutral-400'}`}>
                Phase: {currentStage}
              </span>
              {isExecuting && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              )}
            </div>
            <p className={`text-xs font-medium ${currentStage === 'STEP_FAILED' || currentStage === 'ERROR' ? 'text-red-300' : 'text-white'}`}>{stageMessage}</p>
          </div>
        </div>

        {/* Jev System 1 Telemetry (Monochrome minimal pill) */}
        {structuredGoal && (
          <div className="flex items-center gap-4 bg-[#030303] px-3.5 py-1.5 rounded-xl border border-white/[0.06] text-xs font-mono">
            <div>
              <span className="text-neutral-500 text-[10px] block">Jev Routing</span>
              <span className="text-white font-medium">{structuredGoal.jev_routing_latency_ms} ms</span>
            </div>
            <div className="h-5 w-px bg-white/[0.08]"></div>
            <div>
              <span className="text-neutral-500 text-[10px] block">Confidence</span>
              <span className="text-neutral-300 font-medium">{(structuredGoal.jev_confidence * 100).toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* STEP FAILURE ALERT BANNER */}
      {currentStage === 'STEP_FAILED' && (
        <div className="p-4 rounded-xl bg-red-500/[0.08] border border-red-500/30 flex items-start gap-3 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-red-300">Execution Blocked: Maximum Retries Exceeded (5/5)</span>
            <p className="font-mono text-[11px] text-red-300/80 leading-relaxed">{stageMessage}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.08] pb-2">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'timeline'
              ? 'bg-white/[0.06] text-white border border-white/[0.1]'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Execution DAG & Reviews</span>
        </button>

        <button
          onClick={() => setActiveTab('blackboard')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'blackboard'
              ? 'bg-white/[0.06] text-white border border-white/[0.1]'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Common Context Blackboard</span>
          {blackboard?.negative_knowledge.length ? (
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-neutral-300 font-mono">
              {blackboard.negative_knowledge.length}
            </span>
          ) : null}
        </button>

        {finalEvaluation && (
          <button
            onClick={() => setActiveTab('deliverables')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'deliverables'
                ? 'bg-white/[0.06] text-white border border-white/[0.1]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
            <span>Deliverables ({finalEvaluation.overall_completion_score}%)</span>
          </button>
        )}
      </div>

      {/* TAB 1: EXECUTION DAG & REVIEWS */}
      {activeTab === 'timeline' && structuredGoal && (
        <div className="space-y-3">
          {structuredGoal.sub_tasks.map((task) => {
            const output = blackboard?.completed_outputs[task.step_id];
            const review = blackboard?.intermediate_reviews[task.step_id];
            const isActive = activeSubtask?.step_id === task.step_id;
            const isCompleted = !!output && !!review;
            const isExpanded = expandedStep === task.step_id || isActive;

            return (
              <div
                key={task.step_id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isActive
                    ? 'bg-[#0a0a0a] border-white/30 shadow-lg'
                    : isCompleted
                    ? 'bg-[#080808] border-white/[0.08]'
                    : 'bg-[#040404] border-white/[0.04] opacity-50'
                }`}
              >
                {/* Step Header */}
                <div
                  onClick={() => toggleStep(task.step_id)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                      {getDomainIcon(task.domain)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.2 rounded bg-white/[0.04] text-neutral-400 border border-white/[0.06]">
                          {task.step_id.toUpperCase()} &bull; {task.domain}
                        </span>
                        {(task as any).is_dynamically_added && (
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                            ⚡ Dynamically Added Specialist
                          </span>
                        )}
                        <h4 className="text-xs font-medium text-white">{task.title}</h4>
                      </div>
                      {(task as any).dynamic_insertion_reason && (
                        <p className="text-[11px] text-amber-300/80 font-mono mt-0.5">
                          Trigger: {(task as any).dynamic_insertion_reason}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-1 font-mono">
                        <span>Worker: <strong className="text-neutral-300">{task.assigned_worker_model.split(' ')[0]}</strong></span>
                        <span>&bull;</span>
                        <span>Reviewer: <strong className="text-neutral-300">{task.assigned_reviewer_model || 'Gemini 2.0 Flash'}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isActive ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-neutral-300 font-mono px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1]">
                        <Clock className="w-3 h-3 animate-spin" /> In Progress
                      </span>
                    ) : task.status === 'failed' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-400 font-mono px-2 py-0.5 rounded bg-red-500/[0.1] border border-red-500/20">
                          Failed (5/5 tries) &bull; {review?.quality_score ?? 0}%
                        </span>
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      </div>
                    ) : isCompleted ? (
                      <div className="flex items-center gap-2">
                        {task.retry_count && task.retry_count > 0 ? (
                          <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/[0.1] border border-amber-500/20">
                            {task.retry_count + 1}/5 tries
                          </span>
                        ) : null}
                        {(() => {
                          const score = review?.quality_score ?? 0;
                          const isPassed = review?.passed !== false && score >= 85;
                          const isWarning = score >= 70 && score < 85;
                          const revName = review?.reviewer_model ? review.reviewer_model.split(' ')[0] : 'QA';

                          if (isPassed) {
                            return (
                              <>
                                <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/[0.08] border border-emerald-500/20">
                                  {revName} QA {score}%
                                </span>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              </>
                            );
                          } else if (isWarning) {
                            return (
                              <>
                                <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/[0.1] border border-amber-500/20">
                                  {revName} QA {score}%
                                </span>
                                <AlertCircle className="w-4 h-4 text-amber-400" />
                              </>
                            );
                          } else {
                            return (
                              <>
                                <span className="text-[10px] text-rose-400 font-mono px-2 py-0.5 rounded bg-rose-500/[0.1] border border-rose-500/20">
                                  {revName} QA {score}%
                                </span>
                                <AlertCircle className="w-4 h-4 text-rose-400" />
                              </>
                            );
                          }
                        })()}
                      </div>
                    ) : (
                      <span className="text-[11px] text-neutral-600 font-mono">Pending</span>
                    )}

                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/[0.06] space-y-3.5">
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      {task.description}
                    </p>

                    {/* Worker Output */}
                    {output && (() => {
                      const fileInfo = parseDeliverableFile(
                        task.title,
                        output.output_text,
                        task.domain,
                        output.artifacts
                      );
                      const isOutputCopied = copiedKey === `step_${task.step_id}`;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                            <span>
                              Output ({output.worker_model})
                              {output.attempt && output.attempt > 1 ? ` • Attempt ${output.attempt}/5 ` : ''}
                              &bull; {output.execution_time_ms} ms
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  setRawViewSteps((prev) => ({
                                    ...prev,
                                    [task.step_id]: !prev[task.step_id],
                                  }))
                                }
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition text-[11px] font-mono border border-white/[0.08]"
                                title="Toggle rendered Markdown/Math vs raw plain text"
                              >
                                <span>{rawViewSteps[task.step_id] ? 'View Formatted' : 'View Raw'}</span>
                              </button>
                              <button
                                onClick={() => handleCopy(`step_${task.step_id}`, sanitizeDisplayOutput(output.output_text))}
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition text-[11px] font-mono border border-white/[0.08]"
                                title="Copy code/text to clipboard"
                              >
                                {isOutputCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-neutral-400" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              {fileInfo.isDocx ? (
                                <>
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.docx_url || fileInfo.docxUrl, fileInfo.filename)}
                                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 hover:text-white transition text-[11px] font-mono border border-blue-500/40"
                                    title="Download Microsoft Word (.docx)"
                                  >
                                    <Download className="w-3 h-3 text-blue-300" />
                                    <span>Download (.docx)</span>
                                  </button>
                                  {(output.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl) && (
                                    <button
                                      onClick={() => handleDownload(fileInfo, output.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl, output.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx')}
                                      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 hover:text-white transition text-[11px] font-mono border border-emerald-500/40"
                                      title="Download Answer Key (.docx)"
                                    >
                                      <Download className="w-3 h-3 text-emerald-300" />
                                      <span>Answer Key (.docx)</span>
                                    </button>
                                  )}
                                </>
                              ) : fileInfo.extension.toLowerCase() === 'md' ? (
                                (output.artifacts?.pdf_url || fileInfo.pdfUrl) ? (
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.pdf_url || fileInfo.pdfUrl, output.artifacts?.pdf_filename || output.artifacts?.filename || `${fileInfo.filename.replace(/\.md$/, '')}.pdf`)}
                                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-600/30 hover:bg-red-600/50 text-red-200 hover:text-white transition text-[11px] font-mono border border-red-500/40"
                                    title="Download as PDF Document"
                                  >
                                    <Download className="w-3 h-3 text-red-300" />
                                    <span>Download (PDF)</span>
                                  </button>
                                ) : null
                              ) : (
                                <button
                                  onClick={() => handleDownload(fileInfo)}
                                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition text-[11px] font-mono border border-white/[0.1]"
                                  title={`Download as .${fileInfo.extension.toLowerCase()}`}
                                >
                                  <Download className="w-3 h-3 text-neutral-300" />
                                  <span>Download (.{fileInfo.extension.toLowerCase()})</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Word (.docx) Document Deliverable Card */}
                          {(output.artifacts?.docx_url || fileInfo.isDocx) && (
                            <div className="rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-950/40 to-[#0b1329] p-4 space-y-3 shadow-lg">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="p-2.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">
                                    <FileText className="w-5 h-5 text-blue-400" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-semibold text-white font-mono">{fileInfo.filename}</h4>
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                                        Word (.docx)
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-blue-200/80 font-mono mt-0.5">
                                      Publication-Grade Microsoft Word Document &bull; Verified Content
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.docx_url || fileInfo.docxUrl, fileInfo.filename)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-mono font-medium shadow-md hover:shadow-blue-500/25"
                                    title="Download Word Document (.docx)"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download Word (.docx)</span>
                                  </button>
                                </div>
                              </div>

                              {/* Separate Answer Key Download Row */}
                              {(output.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl) && (
                                <div className="pt-2.5 border-t border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono font-semibold text-emerald-400">🔑 Separate Answer Key:</span>
                                    <span className="text-[11px] font-mono text-neutral-300">
                                      {output.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx'}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl, output.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx')}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs font-mono font-medium shadow"
                                    title="Download Separate Answer Key (.docx)"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download Answer Key (.docx)</span>
                                  </button>
                                </div>
                              )}

                              {/* Optional PDF Companions */}
                              {(output.artifacts?.pdf_url || fileInfo.pdfUrl) && (
                                <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-neutral-400 gap-2">
                                  <span>Companion PDF Document</span>
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={output.artifacts?.pdf_url || fileInfo.pdfUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        const url = output.artifacts?.pdf_url || fileInfo.pdfUrl;
                                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                      }}
                                      className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition cursor-pointer"
                                    >
                                      <span>View PDF</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <button
                                      onClick={() => handleDownload(fileInfo, output.artifacts?.pdf_url || fileInfo.pdfUrl, output.artifacts?.pdf_filename || `${fileInfo.filename.replace(/\.docx$/, '')}.pdf`)}
                                      className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Download PDF</span>
                                    </button>
                                    {(output.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl) && (
                                      <button
                                        onClick={() => handleDownload(fileInfo, output.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl, output.artifacts?.pdf_answer_key_filename || 'Answer_Key.pdf')}
                                        className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>Answer Key PDF</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* PDF Document Deliverable Card (When not a Word doc) */}
                          {!fileInfo.isDocx && (output.artifacts?.pdf_url || fileInfo.isPdf) && (
                            <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-3.5 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-semibold text-white font-mono">{fileInfo.filename}</h4>
                                    <p className="text-[10px] text-blue-300/80 font-mono">Verified Publication-Quality PDF Document • ReportLab Engine</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <a
                                    href={output.artifacts?.pdf_url || fileInfo.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const url = output.artifacts?.pdf_url || fileInfo.pdfUrl;
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px] font-mono cursor-pointer"
                                  >
                                    <span>View PDF</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.pdf_url || fileInfo.pdfUrl, fileInfo.filename)}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition text-[11px] font-mono font-medium shadow-md"
                                    title="Download PDF (.pdf)"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download PDF (.pdf)</span>
                                  </button>
                                </div>
                              </div>
                              {(output.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl) && (
                                <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between">
                                  <span className="text-[11px] font-mono text-emerald-400 font-medium">
                                    🔑 Separate Answer Key (PDF): {output.artifacts?.pdf_answer_key_filename || fileInfo.pdfAnswerKeyFilename || 'Answer_Key.pdf'}
                                  </span>
                                  <button
                                    onClick={() => handleDownload(fileInfo, output.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl, output.artifacts?.pdf_answer_key_filename || fileInfo.pdfAnswerKeyFilename || 'Answer_Key.pdf')}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition text-[11px] font-mono font-medium"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download Answer Key (PDF)</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Video Asset Deliverable Card */}
                          {(output.artifacts?.video_url || fileInfo.isVideo) && (
                            <div className="rounded-xl overflow-hidden border border-purple-500/30 bg-[#050505] p-2 space-y-2">
                              <video
                                src={output.artifacts?.video_url || fileInfo.videoUrl}
                                controls
                                className="w-full h-auto max-h-96 rounded-lg bg-black"
                              />
                              <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                                <span>Cinematic Motion Video • H.264 MP4</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDownload(fileInfo)}
                                    className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px]"
                                    title="Download video (.mp4)"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download Video (.mp4)</span>
                                  </button>
                                  <a
                                    href={output.artifacts?.video_url || fileInfo.videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-white hover:underline flex items-center gap-1"
                                  >
                                    Open Video &rarr;
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Audio Track Deliverable Card */}
                          {(output.artifacts?.audio_url || fileInfo.isAudio) && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-3 space-y-2">
                              <audio
                                src={output.artifacts?.audio_url || fileInfo.audioUrl}
                                controls
                                className="w-full h-10 rounded"
                              />
                              <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                                <span>Audio Track • {fileInfo.extension}</span>
                                <button
                                  onClick={() => handleDownload(fileInfo)}
                                  className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px]"
                                  title={`Download audio (.${fileInfo.extension.toLowerCase()})`}
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Download Audio (.{fileInfo.extension.toLowerCase()})</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Image Asset Deliverable Card */}
                          {output.artifacts?.image_url && (
                            <div className="rounded-xl overflow-hidden border border-white/[0.12] bg-[#050505] p-2 space-y-2">
                              <img
                                src={output.artifacts.image_url}
                                alt="Generated Visual Asset"
                                className="w-full h-auto max-h-96 object-contain rounded-lg shadow-xl"
                                loading="lazy"
                              />
                              <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                                <span>Flux.1 Synthesis • 1280x720</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDownload(fileInfo)}
                                    className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px]"
                                    title="Download image (.jpg)"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download Image (.jpg)</span>
                                  </button>
                                  <a
                                    href={output.artifacts.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-white hover:underline flex items-center gap-1"
                                  >
                                    Open Full Size &rarr;
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}
                          {rawViewSteps[task.step_id] ? (
                            <pre className="p-4 rounded-xl bg-[#020202] border border-white/[0.08] font-mono text-xs text-neutral-200 overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[220px] max-h-[650px] overflow-y-auto selection:bg-indigo-500/30">
                              {sanitizeDisplayOutput(output.output_text)}
                            </pre>
                          ) : (
                            <div className="p-4 rounded-xl bg-[#020202] border border-white/[0.08] text-xs text-neutral-200 min-h-[220px] max-h-[650px] overflow-y-auto selection:bg-indigo-500/30">
                              <MarkdownRenderer content={sanitizeDisplayOutput(output.output_text)} />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Dedicated Reviewer Inspection Card */}
                    {review && (() => {
                      const score = review.quality_score ?? 0;
                      const isPassed = review.passed !== false && score >= 85;
                      const isWarning = score >= 70 && score < 85;
                      const borderColor = isPassed ? 'border-emerald-500/30' : isWarning ? 'border-amber-500/40' : 'border-rose-500/40';
                      const textColor = isPassed ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-rose-400';
                      const badgeStyle = isPassed
                        ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                        : isWarning
                        ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                        : 'text-rose-300 bg-rose-500/10 border-rose-500/20';

                      return (
                        <div className={`p-3.5 rounded-xl bg-white/[0.02] border ${borderColor} space-y-2`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className={`w-3.5 h-3.5 ${textColor}`} />
                              <span className={`text-[11px] font-mono font-medium ${textColor} uppercase tracking-wider`}>
                                Dedicated Reviewer Gate: {review.reviewer_model}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {score < 85 && (
                                <span className={`text-[10px] font-mono ${isWarning ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'} px-2 py-0.5 rounded border`}>
                                  Minimum 85% Required
                                </span>
                              )}
                              <span className={`text-[10px] font-mono ${badgeStyle} px-2 py-0.5 rounded border`}>
                                Score: {score}/100 ({review.status ? review.status.toUpperCase() : (isPassed ? 'APPROVED' : 'REJECTED')})
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-neutral-300 font-mono whitespace-pre-wrap">
                            {review.critique}
                          </p>
                          {review.reviewer_regenerate_prompt && (
                            <div className="mt-2 p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 space-y-1">
                              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold block">
                                Reviewer Corrective Prompt (Used for Auto-Regeneration):
                              </span>
                              <p className="text-xs text-amber-200/90 font-mono leading-relaxed">
                                {review.reviewer_regenerate_prompt}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: COMMON CONTEXT BLACKBOARD */}
      {activeTab === 'blackboard' && blackboard && (
        <div className="space-y-5">
          {/* Prerequisites */}
          <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
              Global Prerequisites & Ingested Assets
            </h4>
            <div className="space-y-1.5 font-mono text-xs text-neutral-300">
              {blackboard.global_prerequisites.map((p, i) => (
                <div key={i} className="p-2 rounded-lg bg-[#030303] border border-white/[0.06]">
                  {p}
                </div>
              ))}
            </div>
          </div>

          {/* Negative Knowledge & Avoidance Registry */}
          <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.12] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Negative Knowledge & Avoidance Registry ({blackboard.negative_knowledge.length} Logged)
              </h4>
              <span className="text-[10px] font-mono text-neutral-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                Continuity Shield
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Reviewer critiques and edge cases captured here to prevent downstream agents from repeating past mistakes:
            </p>

            <div className="space-y-2.5">
              {blackboard.negative_knowledge.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-medium text-white uppercase">
                      [{item.stage}] {item.issue_type}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">Origin: {item.step_id}</span>
                  </div>
                  <p className="text-xs text-neutral-400"><strong>Observed:</strong> {item.description}</p>
                  <p className="text-xs text-neutral-300 font-mono">
                    <strong>Avoidance Rule:</strong> {item.prevention_directive_for_downstream}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Inter-Agent Handovers (Dual-Channel State) */}
          {blackboard.inter_agent_handovers && Object.keys(blackboard.inter_agent_handovers).length > 0 && (
            <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  Inter-Agent Handovers & Dual-Channel Coordination
                </h4>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/[0.08] px-2 py-0.5 rounded border border-cyan-500/20">
                  Leak Prevention Shield
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Internal parameters, directives, and target objects passed privately between swarm specialists (cleanly decoupled from user deliverables):
              </p>
              <div className="space-y-2 font-mono text-xs">
                {Object.entries(blackboard.inter_agent_handovers).map(([stepId, handoverData]) => (
                  <div key={stepId} className="p-3 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                      <span className="font-semibold text-white uppercase">STAGE {stepId} &rarr; DOWNSTREAM AGENTS</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(handoverData).map(([k, v]) => (
                        <div key={k} className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                          <span className="text-neutral-500">{k}:</span>{' '}
                          <span className="text-cyan-300 font-semibold">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cumulative Outputs Ledger */}
          <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Cumulative Verified Outputs Ledger
            </h4>
            <div className="space-y-2.5 font-mono text-xs">
              {Object.entries(blackboard.completed_outputs).map(([stepId, res]) => (
                <div key={stepId} className="p-3 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between text-neutral-500 text-[11px]">
                    <span className="font-semibold text-white">{stepId.toUpperCase()} ({res.domain})</span>
                    <span>{res.worker_model}</span>
                  </div>
                  <p className="text-neutral-400 line-clamp-2">{res.output_text.slice(0, 160)}...</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERABLES & FINAL SCORE */}
      {activeTab === 'deliverables' && finalEvaluation && (
        <div className="space-y-5">
          {/* Completion Score Card */}
          <div className="p-6 rounded-2xl bg-[#080808] border border-white/[0.12] flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-neutral-400 font-mono">
                <Sparkles className="w-3 h-3 text-neutral-400" />
                <span>Verification Complete</span>
              </div>
              <h3 className="text-2xl font-medium text-white tracking-tight">Objective Successfully Executed</h3>
              <p className="text-xs text-neutral-400 max-w-md leading-relaxed">
                {finalEvaluation.summary_for_user}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#030303] border border-white/[0.1] min-w-[160px]">
              <span className="text-4xl font-light text-white tracking-tight">
                {finalEvaluation.overall_completion_score}%
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mt-1">
                Completion Score
              </span>
            </div>
          </div>

          {/* Compliance Breakdown */}
          <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Quality Metric Breakdown</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(finalEvaluation.compliance_breakdown).map(([metric, score]) => (
                <div key={metric} className="p-3 rounded-xl bg-[#030303] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{metric}</span>
                    <span className="font-mono text-white">{score}%</span>
                  </div>
                  <div className="w-full bg-white/[0.06] h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-white h-full rounded-full"
                      style={{ width: `${score}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deliverables Explorer */}
          <div className="p-5 rounded-2xl bg-[#080808] border border-white/[0.08] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Generated Deliverables & Assets</h4>
            <div className="space-y-3">
              {Object.entries(finalEvaluation.deliverables).map(([id, del]) => {
                const fileInfo = parseDeliverableFile(del.title, del.summary, del.domain, del.artifacts);
                const isDelCopied = copiedKey === `del_${id}`;
                return (
                  <div key={id} className="p-4 rounded-xl bg-[#030303] border border-white/[0.06] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getDomainIcon(del.domain)}
                        <h5 className="text-xs font-medium text-white capitalize">{del.title}</h5>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-neutral-400 uppercase">
                          {del.domain}
                        </span>
                        <button
                          onClick={() =>
                            setRawViewSteps((prev) => ({
                              ...prev,
                              [`del_${id}`]: !prev[`del_${id}`],
                            }))
                          }
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition text-[11px] font-mono border border-white/[0.08]"
                          title="Toggle rendered Markdown/Math vs raw plain text"
                        >
                          <span>{rawViewSteps[`del_${id}`] ? 'View Formatted' : 'View Raw'}</span>
                        </button>
                        <button
                          onClick={() => handleCopy(`del_${id}`, del.summary)}
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition text-[11px] font-mono border border-white/[0.08]"
                          title="Copy deliverable content"
                        >
                          {isDelCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-neutral-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        {fileInfo.isDocx ? (
                          <>
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.docx_url || fileInfo.docxUrl, fileInfo.filename)}
                              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 hover:text-white transition text-[11px] font-mono border border-blue-500/40"
                              title="Download Microsoft Word (.docx)"
                            >
                              <Download className="w-3 h-3 text-blue-300" />
                              <span>Download (.docx)</span>
                            </button>
                            {(del.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl) && (
                              <button
                                onClick={() => handleDownload(fileInfo, del.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl, del.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx')}
                                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 hover:text-white transition text-[11px] font-mono border border-emerald-500/40"
                                title="Download Answer Key (.docx)"
                              >
                                <Download className="w-3 h-3 text-emerald-300" />
                                <span>Answer Key (.docx)</span>
                              </button>
                            )}
                          </>
                        ) : fileInfo.extension.toLowerCase() === 'md' ? (
                          (del.artifacts?.pdf_url || fileInfo.pdfUrl) ? (
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.pdf_url || fileInfo.pdfUrl, del.artifacts?.pdf_filename || del.artifacts?.filename || `${fileInfo.filename.replace(/\.md$/, '')}.pdf`)}
                              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-600/30 hover:bg-red-600/50 text-red-200 hover:text-white transition text-[11px] font-mono border border-red-500/40"
                              title="Download as PDF Document"
                            >
                              <Download className="w-3 h-3 text-red-300" />
                              <span>Download (PDF)</span>
                            </button>
                          ) : null
                        ) : (
                          <button
                            onClick={() => handleDownload(fileInfo)}
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.14] text-neutral-200 hover:text-white transition text-[11px] font-mono border border-white/[0.1]"
                            title={`Download ${fileInfo.filename}`}
                          >
                            <Download className="w-3 h-3 text-neutral-300" />
                            <span>Download (.{fileInfo.extension.toLowerCase()})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Word (.docx) Document Deliverable Card */}
                    {(del.artifacts?.docx_url || fileInfo.isDocx) && (
                      <div className="rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-950/40 to-[#0b1329] p-4 space-y-3 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">
                              <FileText className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-semibold text-white font-mono">{fileInfo.filename}</h4>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                                  Word (.docx)
                                </span>
                              </div>
                              <p className="text-[11px] text-blue-200/80 font-mono mt-0.5">
                                Publication-Grade Microsoft Word Document &bull; Verified Content
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.docx_url || fileInfo.docxUrl, fileInfo.filename)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-mono font-medium shadow-md hover:shadow-blue-500/25"
                              title="Download Word Document (.docx)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Word (.docx)</span>
                            </button>
                          </div>
                        </div>

                        {/* Separate Answer Key Download Row */}
                        {(del.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl) && (
                          <div className="pt-2.5 border-t border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-semibold text-emerald-400">🔑 Separate Answer Key:</span>
                              <span className="text-[11px] font-mono text-neutral-300">
                                {del.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx'}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.docx_answer_key_url || fileInfo.docxAnswerKeyUrl, del.artifacts?.docx_answer_key_filename || fileInfo.docxAnswerKeyFilename || 'Answer_Key.docx')}
                              className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs font-mono font-medium shadow"
                              title="Download Separate Answer Key (.docx)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Answer Key (.docx)</span>
                            </button>
                          </div>
                        )}

                        {/* Optional PDF Companions */}
                        {(del.artifacts?.pdf_url || fileInfo.pdfUrl) && (
                          <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-neutral-400 gap-2">
                            <span>Companion PDF Document</span>
                            <div className="flex items-center gap-2">
                              <a
                                href={del.artifacts?.pdf_url || fileInfo.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const url = del.artifacts?.pdf_url || fileInfo.pdfUrl;
                                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                                className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition cursor-pointer"
                              >
                                <span>View PDF</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                onClick={() => handleDownload(fileInfo, del.artifacts?.pdf_url || fileInfo.pdfUrl, del.artifacts?.pdf_filename || `${fileInfo.filename.replace(/\.docx$/, '')}.pdf`)}
                                className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download PDF</span>
                              </button>
                              {(del.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl) && (
                                <button
                                  onClick={() => handleDownload(fileInfo, del.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl, del.artifacts?.pdf_answer_key_filename || 'Answer_Key.pdf')}
                                  className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Answer Key PDF</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PDF Document Deliverable Card (When not a Word doc) */}
                    {!fileInfo.isDocx && (del.artifacts?.pdf_url || fileInfo.isPdf) && (
                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-white font-mono">{fileInfo.filename}</h4>
                              <p className="text-[10px] text-blue-300/80 font-mono">Verified Publication-Quality PDF Document • ReportLab Engine</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={del.artifacts?.pdf_url || fileInfo.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                const url = del.artifacts?.pdf_url || fileInfo.pdfUrl;
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                              className="text-neutral-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px] font-mono cursor-pointer"
                            >
                              <span>View PDF</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.pdf_url || fileInfo.pdfUrl, fileInfo.filename)}
                              className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition text-[11px] font-mono font-medium shadow-md"
                              title="Download PDF (.pdf)"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download PDF (.pdf)</span>
                            </button>
                          </div>
                        </div>
                        {(del.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl) && (
                          <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between">
                            <span className="text-[11px] font-mono text-emerald-400 font-medium">
                              🔑 Separate Answer Key (PDF): {del.artifacts?.pdf_answer_key_filename || fileInfo.pdfAnswerKeyFilename || 'Answer_Key.pdf'}
                            </span>
                            <button
                              onClick={() => handleDownload(fileInfo, del.artifacts?.pdf_answer_key_url || fileInfo.pdfAnswerKeyUrl, del.artifacts?.pdf_answer_key_filename || fileInfo.pdfAnswerKeyFilename || 'Answer_Key.pdf')}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition text-[11px] font-mono font-medium"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download Answer Key (PDF)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Video Asset Deliverable Card */}
                    {(del.artifacts?.video_url || fileInfo.isVideo) && (
                      <div className="rounded-xl overflow-hidden border border-purple-500/30 bg-[#050505] p-2 space-y-2">
                        <video
                          src={del.artifacts?.video_url || fileInfo.videoUrl}
                          controls
                          className="w-full h-auto max-h-96 rounded-lg bg-black"
                        />
                        <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                          <span>Cinematic Motion Video • H.264 MP4</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(fileInfo)}
                              className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px]"
                              title="Download video (.mp4)"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download Video (.mp4)</span>
                            </button>
                            <a
                              href={del.artifacts?.video_url || fileInfo.videoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white hover:underline flex items-center gap-1"
                            >
                              Open Video &rarr;
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Audio Track Deliverable Card */}
                    {(del.artifacts?.audio_url || fileInfo.isAudio) && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-3 space-y-2">
                        <audio
                          src={del.artifacts?.audio_url || fileInfo.audioUrl}
                          controls
                          className="w-full h-10 rounded"
                        />
                        <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                          <span>Audio Track • {fileInfo.extension}</span>
                          <button
                            onClick={() => handleDownload(fileInfo)}
                            className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition text-[11px]"
                            title={`Download audio (.${fileInfo.extension.toLowerCase()})`}
                          >
                            <Download className="w-3 h-3" />
                            <span>Download Audio (.{fileInfo.extension.toLowerCase()})</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Image Asset Deliverable Card */}
                    {del.artifacts?.image_url && (
                      <div className="rounded-xl overflow-hidden border border-white/[0.12] bg-[#050505] p-2 space-y-2">
                        <img
                          src={del.artifacts.image_url}
                          alt={del.title}
                          className="w-full h-auto max-h-96 object-contain rounded-lg"
                          loading="lazy"
                        />
                        <div className="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
                          <span>Flux.1 Asset</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(fileInfo)}
                              className="text-neutral-300 hover:text-white flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition text-[11px]"
                              title="Download image (.jpg)"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download Image (.jpg)</span>
                            </button>
                            <a
                              href={del.artifacts.image_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white hover:underline flex items-center gap-1"
                            >
                              Open Full Size &rarr;
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {rawViewSteps[`del_${id}`] ? (
                      <pre className="p-4 rounded-xl bg-[#000000] font-mono text-xs text-neutral-200 min-h-[220px] max-h-[650px] overflow-y-auto whitespace-pre-wrap border border-white/[0.08] selection:bg-indigo-500/30">
                        {del.summary}
                      </pre>
                    ) : (
                      <div className="p-4 rounded-xl bg-[#000000] text-xs text-neutral-200 min-h-[220px] max-h-[650px] overflow-y-auto border border-white/[0.08] selection:bg-indigo-500/30">
                        <MarkdownRenderer content={del.summary} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Anticipated Blind Spots (Smart Mode) */}
          {(finalEvaluation.delivery_mode === 'smart' || finalEvaluation.delivery_mode === 'overdeliver') && finalEvaluation.anticipated_blind_spots && finalEvaluation.anticipated_blind_spots.length > 0 && (
            <div className="p-5 rounded-2xl bg-[#080808] border border-amber-500/20 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center text-[10px] font-mono border border-amber-500/20">!</span>
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Anticipated Blind Spots & Pitfalls</h4>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Anticipatory Intelligence
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Unknown unknowns and critical nuances Omni pre-emptively accounted for during orchestration:
              </p>
              <div className="space-y-2.5">
                {finalEvaluation.anticipated_blind_spots.map((spot, sIdx) => {
                  const parts = spot.split(': ');
                  const title = parts.length > 1 ? parts[0] : `Critical Observation ${sIdx + 1}`;
                  const body = parts.length > 1 ? parts.slice(1).join(': ') : spot;
                  return (
                    <div key={sIdx} className="p-3.5 rounded-xl bg-[#030303] border border-amber-500/15 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-amber-200 block">{title}</span>
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
    </div>
  );
};
