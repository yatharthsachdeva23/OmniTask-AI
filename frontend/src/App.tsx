import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Track1Advisor } from './components/Track1Advisor';
import { Track2Execution } from './components/Track2Execution';
import { AnalyzerWorkspace } from './components/AnalyzerWorkspace';
import { WorkerWorkspace } from './components/WorkerWorkspace';
import { IngestedFile, DeliveryMode } from './types';
import { ToolCatalogModal } from './components/ToolCatalogModal';
import { AiOrchestrationMesh } from './components/AiOrchestrationMesh';
import { Compass, Zap, ArrowDown, ChevronDown, Sparkles, Layers, ShieldCheck, Cpu } from 'lucide-react';

type AppView = 'landing' | 'analyzer-workspace' | 'worker-workspace';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('landing');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('smart');
  const [analyzerPrompt, setAnalyzerPrompt] = useState<string>('');
  const [workerPrompt, setWorkerPrompt] = useState<string>('');
  const [workerFiles, setWorkerFiles] = useState<IngestedFile[]>([]);
  const [workerAskBeforeDoing, setWorkerAskBeforeDoing] = useState<boolean>(true);
  const [workerClarifications, setWorkerClarifications] = useState<Record<string, string> | undefined>(undefined);
  const [workerPlanSummary, setWorkerPlanSummary] = useState<string | undefined>(undefined);

  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');

  // Section Opacities for smooth scroll fade-in / fade-out
  const [heroOpacity, setHeroOpacity] = useState<number>(1);
  const [analyzerOpacity, setAnalyzerOpacity] = useState<number>(0.2);
  const [workerOpacity, setWorkerOpacity] = useState<number>(0.2);

  const heroRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<HTMLDivElement>(null);

  // Smooth scroll helper
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Continuous Scroll Fade Calculator & Active Section Observer
  useEffect(() => {
    const calculateSectionOpacity = (el: HTMLElement | null): number => {
      if (!el) return 0.2;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;

      if (rect.top <= vh * 0.5 && rect.bottom >= vh * 0.5) {
        return 1.0;
      }
      if (rect.top > vh * 0.5) {
        const dist = rect.top - vh * 0.5;
        const maxDist = vh * 0.6;
        return Math.max(0.15, Math.min(1.0, 1.0 - (dist / maxDist) * 0.85));
      }
      if (rect.bottom < vh * 0.5) {
        const dist = (vh * 0.5) - rect.bottom;
        const maxDist = vh * 0.6;
        return Math.max(0.15, Math.min(1.0, 1.0 - (dist / maxDist) * 0.85));
      }
      return 1.0;
    };

    const handleScroll = () => {
      const hOp = calculateSectionOpacity(heroRef.current);
      const aOp = calculateSectionOpacity(analyzerRef.current);
      const wOp = calculateSectionOpacity(workerRef.current);

      setHeroOpacity(hOp);
      setAnalyzerOpacity(aOp);
      setWorkerOpacity(wOp);

      if (hOp >= aOp && hOp >= wOp) {
        setActiveSection('hero');
      } else if (aOp >= hOp && aOp >= wOp) {
        setActiveSection('analyzer');
      } else {
        setActiveSection('worker-pool');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // VIEW 1: DEDICATED ANALYZER WORKSPACE ("NEW WEBPAGE")
  if (activeView === 'analyzer-workspace') {
    return (
      <>
        <AnalyzerWorkspace
          prompt={analyzerPrompt}
          initialDeliveryMode={deliveryMode}
          onBack={() => {
            setActiveView('landing');
            setTimeout(() => scrollToSection('analyzer'), 50);
          }}
          onRunAgain={(newP) => setAnalyzerPrompt(newP)}
          onDeployToWorkerPool={(p, mode) => {
            setWorkerPrompt(p);
            setDeliveryMode(mode || deliveryMode);
            setWorkerFiles([]);
            setWorkerAskBeforeDoing(true);
            setWorkerClarifications(undefined);
            setWorkerPlanSummary(undefined);
            setActiveView('worker-workspace');
          }}
        />
        <ToolCatalogModal
          isOpen={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
        />
      </>
    );
  }

  // VIEW 2: DEDICATED WORKER POOL WORKSPACE ("NEW WEBPAGE")
  if (activeView === 'worker-workspace') {
    return (
      <>
        <WorkerWorkspace
          prompt={workerPrompt}
          files={workerFiles}
          deliveryMode={deliveryMode}
          askBeforeDoing={workerAskBeforeDoing}
          clarifications={workerClarifications}
          approvedPlanSummary={workerPlanSummary}
          onBack={() => {
            setActiveView('landing');
            setTimeout(() => scrollToSection('worker-pool'), 50);
          }}
          onRunAgain={(newP) => setWorkerPrompt(newP)}
        />
        <ToolCatalogModal
          isOpen={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
        />
      </>
    );
  }

  const handleOpenChats = () => {
    setWorkerPrompt('');
    setWorkerFiles([]);
    setActiveView('worker-workspace');
  };

  return (
    <div className="min-h-screen bg-black text-[#ededed] flex flex-col font-['Inter',sans-serif] relative selection:bg-white/20 selection:text-white">
      {/* Resend Top Ambient Lighting & Grid */}
      <div className="fixed top-0 left-0 right-0 h-96 resend-radial-glow pointer-events-none z-0"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-3/4 h-px resend-top-line pointer-events-none z-0"></div>

      {/* Top Navbar */}
      <Navbar
        onOpenCatalog={() => setIsCatalogOpen(true)}
        onScrollTo={scrollToSection}
        activeSection={activeSection}
        onOpenChats={handleOpenChats}
      />

      {/* Main Single-Page Scroll Container */}
      <main className="flex-1 relative z-10">

        {/* =========================================================================
            SECTION 1: HERO / LANDING WITH THE TWO BIG OPTION BUTTONS
           ========================================================================= */}
        <section
          id="hero"
          ref={heroRef}
          style={{
            opacity: heroOpacity,
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
          className="min-h-screen flex flex-col justify-center items-center text-center px-4 sm:px-6 py-20 max-w-5xl mx-auto relative"
        >
          {/* Quote & Brand Title */}
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-neutral-400 mb-2 shadow-inner">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>AUTONOMOUS MULTI-AGENT SWARM ORCHESTRATION</span>
            </div>

            <blockquote className="text-2xl sm:text-4xl md:text-5xl font-light tracking-tight text-white leading-tight">
              &ldquo;The future belongs to systems that don&rsquo;t just generate text, but <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400">orchestrate intelligence</span>.&rdquo;
            </blockquote>

            <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-2xl mx-auto leading-relaxed pt-2">
              Select your workflow to begin. Map zero-cost architecture blueprints with the <strong>Analyzer</strong>, 
              or deploy live autonomous specialists with the <strong>Worker Pool</strong>.
            </p>
          </div>

          {/* THE TWO LARGE, STYLISH OPTION BUTTONS / CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-4xl mt-12 text-left">
            
            {/* OPTION 1: ARCHITECTURAL ANALYZER */}
            <div
              onClick={() => scrollToSection('analyzer')}
              className="group cursor-pointer p-6 sm:p-7 rounded-2xl bg-[#07080c] border border-white/[0.08] hover:border-emerald-500/40 transition-all duration-300 relative overflow-hidden shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Compass className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Track 1 &bull; Free Advisor
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white tracking-tight mb-2 group-hover:text-emerald-300 transition-colors">
                  Architectural Analyzer
                </h3>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  Deconstruct your project vision into an optimal multi-agent toolchain, DIY milestone roadmap, and compute cost projection.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-medium text-emerald-400 group-hover:text-emerald-300">
                <span>Explore Analyzer Space</span>
                <span className="text-base group-hover:translate-y-0.5 transition-transform">&darr;</span>
              </div>
            </div>

            {/* OPTION 2: AUTONOMOUS WORKER POOL */}
            <div
              onClick={() => scrollToSection('worker-pool')}
              className="group cursor-pointer p-6 sm:p-7 rounded-2xl bg-[#07080c] border border-white/[0.08] hover:border-indigo-500/40 transition-all duration-300 relative overflow-hidden shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <Zap className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    Track 2 &bull; Swarm Hub
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white tracking-tight mb-2 group-hover:text-indigo-300 transition-colors">
                  Autonomous Worker Pool
                </h3>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  Execute compound objectives with Jev Fast Router, Qwen 2.5 Coder, Gemini Multimodal QA, and Common Context Blackboard.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
                <span>Launch Worker Pool Space</span>
                <span className="text-base group-hover:translate-y-0.5 transition-transform">&darr;</span>
              </div>
            </div>

          </div>

          {/* =========================================================================
              AI ORCHESTRATION ENGINES & LOGOS (BELOW THE TWO OPTIONS, ABOVE TRACK 1)
             ========================================================================= */}
          <div className="w-full mt-20 pt-16 border-t border-white/[0.1]">
            <AiOrchestrationMesh onExploreArchitecture={() => setIsCatalogOpen(true)} />
          </div>

          {/* Gentle Scroll Indicator */}
          <div className="mt-14 flex flex-col items-center gap-1.5 text-neutral-500 font-mono text-[11px] select-none opacity-80">
            <span>Scroll to navigate dedicated spaces</span>
            <ChevronDown className="w-4 h-4 animate-bounce text-neutral-400" />
          </div>
        </section>

        {/* =========================================================================
            SECTION 2: DEDICATED ARCHITECTURAL ANALYZER SPACE
           ========================================================================= */}
        <section
          id="analyzer"
          ref={analyzerRef}
          style={{
            opacity: analyzerOpacity,
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
          className="min-h-screen py-24 px-4 sm:px-6 relative flex flex-col justify-start"
        >
          {/* Dedicated Quote Header */}
          <div className="max-w-4xl mx-auto text-center space-y-3 mb-10">
            <span className="inline-block text-[10px] font-mono tracking-wider uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              TRACK 1 &bull; ARCHITECTURAL ADVISORY ENGINE
            </span>
            <blockquote className="text-xl sm:text-2xl font-light italic text-neutral-200">
              &ldquo;Simplicity is prerequisite for reliability. Map your architecture before writing a single line of code.&rdquo;
            </blockquote>
            <p className="text-xs font-mono text-neutral-500">&mdash; Edsger W. Dijkstra</p>
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent mx-auto pt-2"></div>
          </div>

          {/* Full Interactive Tooling for Track 1 */}
          <div className="w-full">
            <Track1Advisor
              initialDeliveryMode={deliveryMode}
              onGenerate={(p, mode) => {
                setAnalyzerPrompt(p);
                setDeliveryMode(mode || 'smart');
                setActiveView('analyzer-workspace');
              }}
              initialPrompt={analyzerPrompt}
            />
          </div>
        </section>

        {/* =========================================================================
            SECTION 3: DEDICATED AUTONOMOUS WORKER POOL SPACE
           ========================================================================= */}
        <section
          id="worker-pool"
          ref={workerRef}
          style={{
            opacity: workerOpacity,
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
          className="min-h-screen py-24 px-4 sm:px-6 relative flex flex-col justify-start"
        >
          {/* Dedicated Quote Header */}
          <div className="max-w-4xl mx-auto text-center space-y-3 mb-10">
            <span className="inline-block text-[10px] font-mono tracking-wider uppercase px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              TRACK 2 &bull; AUTONOMOUS MULTI-AGENT SWARM
            </span>
            <blockquote className="text-xl sm:text-2xl font-light italic text-neutral-200">
              &ldquo;Intelligence is not a single monolithic model, but an orchestrated swarm of disciplined specialists.&rdquo;
            </blockquote>
            <p className="text-xs font-mono text-neutral-500">&mdash; Marvin Minsky, Society of Mind</p>
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent mx-auto pt-2"></div>
          </div>

          {/* Full Interactive Tooling for Track 2 */}
          <div className="w-full">
            <Track2Execution
              initialDeliveryMode={deliveryMode}
              onLaunchExecution={(params) => {
                setWorkerPrompt(params.prompt);
                setWorkerFiles(params.files);
                setDeliveryMode(params.deliveryMode || deliveryMode);
                setWorkerAskBeforeDoing(params.askBeforeDoing);
                setWorkerClarifications(params.clarifications);
                setWorkerPlanSummary(params.approvedPlanSummary);
                setActiveView('worker-workspace');
              }}
              initialPrompt={workerPrompt}
            />
          </div>
        </section>

      </main>

      {/* AI Tool Directory Modal */}
      <ToolCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-white/[0.08] py-8 text-center text-xs text-neutral-500 font-mono relative z-10 bg-black/80">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>OmniTask AI Ecosystem &bull; Python 3.12 Engine</span>
          </div>
          <p className="text-neutral-600 text-[11px]">
            Jev System 1 Routing &bull; Common Context Blackboard &bull; Gemini Multimodal QA
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
