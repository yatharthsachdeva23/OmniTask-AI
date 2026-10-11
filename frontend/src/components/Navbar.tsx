import React, { useState } from 'react';
import { Database, Compass, Zap, Info, BookOpen, Mail, HelpCircle, Home, Menu, X, MessageSquare } from 'lucide-react';
import { SampleNavModal, NavModalTab } from './SampleNavModal';

interface NavbarProps {
  onOpenCatalog: () => void;
  onScrollTo: (sectionId: string) => void;
  activeSection?: string;
  onOpenChats?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCatalog,
  onScrollTo,
  activeSection = 'hero',
  onOpenChats,
}) => {
  const [modalTab, setModalTab] = useState<NavModalTab | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleOpenInfo = (tab: NavModalTab) => {
    setModalTab(tab);
    setMobileMenuOpen(false);
  };

  const handleNavClick = (sectionId: string) => {
    onScrollTo(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/85 border-b border-white/[0.08] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNavClick('hero')}
              className="flex items-center gap-2.5 group text-left"
            >
              <img
                src="/omnitask-logo.png"
                alt="OmniTask AI"
                className="h-6 sm:h-7 w-auto object-contain hover:opacity-90 transition-opacity"
              />
            </button>

            <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-white/[0.1] text-[11px] font-mono text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Jev Fast Router &bull; Python 3.12</span>
            </div>
          </div>

          {/* Center Navigation Links (5-6 sample/nav buttons) */}
          <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-full p-1 shadow-inner">
            <button
              onClick={() => handleNavClick('hero')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeSection === 'hero'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            <button
              onClick={() => handleNavClick('analyzer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeSection === 'analyzer'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Analyzer</span>
            </button>

            <button
              onClick={() => handleNavClick('worker-pool')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeSection === 'worker-pool'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Worker Pool</span>
            </button>

            {onOpenChats && (
              <button
                onClick={onOpenChats}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Chats</span>
              </button>
            )}

            <div className="w-px h-4 bg-white/[0.1] mx-0.5"></div>

            <button
              onClick={() => handleOpenInfo('about')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              <Info className="w-3.5 h-3.5" />
              <span>About Us</span>
            </button>

            <button
              onClick={() => handleOpenInfo('docs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </button>

            <button
              onClick={() => handleOpenInfo('contact')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contact</span>
            </button>

            <button
              onClick={() => handleOpenInfo('help')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Help</span>
            </button>
          </nav>

          {/* Right Action: AI Matrix & Mobile Menu Trigger */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenCatalog}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 hover:text-white border border-white/[0.1] hover:border-white/[0.2] transition-all shadow-sm"
            >
              <Database className="w-3.5 h-3.5 text-neutral-300" />
              <span>AI Matrix</span>
            </button>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.08] bg-black/95 px-4 py-4 space-y-1.5 backdrop-blur-xl animate-in slide-in-from-top-2 duration-150">
            <button
              onClick={() => handleNavClick('hero')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-300 hover:text-white hover:bg-white/[0.06]"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
            <button
              onClick={() => handleNavClick('analyzer')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-300 hover:text-white hover:bg-white/[0.06]"
            >
              <Compass className="w-4 h-4" />
              <span>Architectural Analyzer</span>
            </button>
            <button
              onClick={() => handleNavClick('worker-pool')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-300 hover:text-white hover:bg-white/[0.06]"
            >
              <Zap className="w-4 h-4" />
              <span>Autonomous Worker Pool</span>
            </button>
            {onOpenChats && (
              <button
                onClick={() => {
                  onOpenChats();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-300 hover:text-white hover:bg-white/[0.06]"
              >
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>Chat Workspace</span>
              </button>
            )}
            <div className="h-px bg-white/[0.08] my-2"></div>
            <button
              onClick={() => handleOpenInfo('about')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-400 hover:text-white hover:bg-white/[0.06]"
            >
              <Info className="w-4 h-4" />
              <span>About Us</span>
            </button>
            <button
              onClick={() => handleOpenInfo('docs')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-400 hover:text-white hover:bg-white/[0.06]"
            >
              <BookOpen className="w-4 h-4" />
              <span>Documentation</span>
            </button>
            <button
              onClick={() => handleOpenInfo('contact')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-400 hover:text-white hover:bg-white/[0.06]"
            >
              <Mail className="w-4 h-4" />
              <span>Contact</span>
            </button>
            <button
              onClick={() => handleOpenInfo('help')}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-left text-neutral-400 hover:text-white hover:bg-white/[0.06]"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help & FAQ</span>
            </button>
          </div>
        )}
      </header>

      {/* Pop-up Info Modal */}
      <SampleNavModal
        isOpen={modalTab !== null}
        initialTab={modalTab || 'about'}
        onClose={() => setModalTab(null)}
      />
    </>
  );
};
