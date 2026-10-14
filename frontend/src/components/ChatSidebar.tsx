import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Layers,
  FolderOpen,
  Brain,
  RotateCw,
  Target
} from 'lucide-react';
import { ChatSessionMeta, DeliveryMode } from '../types';

interface ChatSidebarProps {
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onToggle: () => void;
  refreshTrigger?: number;
  deliveryMode?: DeliveryMode;
  onDeliveryModeChange?: (mode: DeliveryMode) => void;
  askBeforeDoing?: boolean;
  onAskBeforeDoingChange?: (val: boolean) => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  currentChatId,
  onSelectChat,
  onNewChat,
  isOpen,
  onToggle,
  refreshTrigger = 0,
  deliveryMode = 'smart',
  onDeliveryModeChange,
  askBeforeDoing = true,
  onAskBeforeDoingChange
}) => {
  const [chats, setChats] = useState<ChatSessionMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isConsolidatingMemory, setIsConsolidatingMemory] = useState(false);
  const [memoryData, setMemoryData] = useState<{
    identity_and_business?: string[];
    persistent_rules_and_preferences?: string[];
    domain_entities_and_topics?: string[];
  } | null>(null);

  const fetchChats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/chats');
      if (res.ok) {
        const data: ChatSessionMeta[] = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMemory = async () => {
    try {
      const res = await fetch('/api/user/memory');
      if (res.ok) {
        const data = await res.json();
        setMemoryData(data);
      }
    } catch (err) {
      console.error('Error fetching persistent memory:', err);
    }
  };

  useEffect(() => {
    fetchChats();
    fetchMemory();
  }, [refreshTrigger]);

  const handleClearAllChats = async () => {
    try {
      const res = await fetch('/api/chats', { method: 'DELETE' });
      if (res.ok) {
        setChats([]);
        onNewChat();
      }
    } catch (err) {
      console.error('Error clearing chats:', err);
    } finally {
      setConfirmClearAll(false);
    }
  };

  const handleConsolidateMemory = async () => {
    try {
      setIsConsolidatingMemory(true);
      const res = await fetch('/api/user/memory/consolidate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMemoryData(data.memory);
      }
    } catch (err) {
      console.error('Error consolidating memory:', err);
    } finally {
      setIsConsolidatingMemory(false);
    }
  };

  const handleClearMemory = async () => {
    try {
      const res = await fetch('/api/user/memory', { method: 'DELETE' });
      if (res.ok) {
        setMemoryData({
          identity_and_business: [],
          persistent_rules_and_preferences: [],
          domain_entities_and_topics: []
        });
      }
    } catch (err) {
      console.error('Error clearing memory:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (deletingId !== chatId) {
      setDeletingId(chatId);
      setTimeout(() => setDeletingId((curr) => (curr === chatId ? null : curr)), 3000);
      return;
    }

    try {
      const res = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      if (res.ok) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (currentChatId === chatId) {
          onNewChat();
        }
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartRename = (e: React.MouseEvent, chat: ChatSessionMeta) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() })
      });
      if (res.ok) {
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: editTitle.trim() } : c))
        );
      }
    } catch (err) {
      console.error('Error renaming chat:', err);
    } finally {
      setEditingId(null);
    }
  };

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group chats by date
  const groupChats = (items: ChatSessionMeta[]) => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const groups: { [key: string]: ChatSessionMeta[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: []
    };

    items.forEach((item) => {
      const diff = now - item.updated_at * 1000;
      if (diff < oneDay) {
        groups.Today.push(item);
      } else if (diff < 2 * oneDay) {
        groups.Yesterday.push(item);
      } else if (diff < 7 * oneDay) {
        groups['Previous 7 Days'].push(item);
      } else {
        groups.Older.push(item);
      }
    });

    return groups;
  };

  const grouped = groupChats(filteredChats);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`bg-[#060709] border-r border-white/[0.08] transition-all duration-300 ease-in-out flex flex-col z-40 h-screen ${
          isOpen
            ? 'fixed inset-y-0 left-0 w-72 sm:w-80 lg:relative lg:inset-auto lg:shrink-0 translate-x-0'
            : 'fixed inset-y-0 left-0 -translate-x-full lg:relative lg:inset-auto lg:translate-x-0 lg:w-0 lg:border-r-0 lg:overflow-hidden'
        }`}
      >
        {/* Top Header */}
        <div className="h-16 px-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          {isOpen ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="truncate">
                <span className="text-xs font-semibold text-white tracking-wide block truncate">
                  Chat History
                </span>
                <span className="text-[10px] text-neutral-500 font-mono block">
                  {chats.length} {chats.length === 1 ? 'conversation' : 'conversations'}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <button
                onClick={onToggle}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center transition"
                title="Expand Chat History"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={onToggle}
            className="hidden lg:flex w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white items-center justify-center transition text-xs"
            title={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* New Chat Action Button */}
        <div className="p-3 border-b border-white/[0.04] shrink-0 space-y-2.5">
          <button
            onClick={onNewChat}
            className={`w-full flex items-center gap-2 rounded-xl transition-all font-mono text-xs font-medium shadow-md ${
              isOpen
                ? 'px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-indigo-600/20'
                : 'p-2.5 justify-center bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white'
            }`}
            title="Start New Chat"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {isOpen && <span>New Chat</span>}
          </button>

          {/* Swarm Mode & Ask Before Doing Controls */}
          {isOpen ? (
            <div className="space-y-2 pt-1 border-t border-white/[0.04]">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                <span>Execution Mode</span>
                <span className="text-emerald-400 font-semibold">Swarm Analysis</span>
              </div>

              {/* Delivery Mode Toggle (Smart vs Strict) */}
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-black/50 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => onDeliveryModeChange?.('smart')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    deliveryMode === 'smart' || deliveryMode === 'overdeliver'
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
                  onClick={() => onDeliveryModeChange?.('strict')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    deliveryMode === 'strict'
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
                onClick={() => onAskBeforeDoingChange?.(!askBeforeDoing)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all select-none ${
                  askBeforeDoing
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/15'
                    : 'bg-black/40 border-white/[0.06] text-neutral-400 hover:text-neutral-300 hover:bg-white/[0.03]'
                }`}
                title={
                  askBeforeDoing
                    ? "Ask Before Doing (Active): Asks clarifying questions and formulates implementation plan before running swarm."
                    : "Ask Before Doing (Disabled): Directly executes full autonomous pipeline in one shot without asking."
                }
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-3 rounded-full p-0.5 transition-colors flex items-center ${
                      askBeforeDoing ? 'bg-emerald-500 justify-end' : 'bg-neutral-700 justify-start'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-black shadow-sm"></div>
                  </div>
                  <span>Ask Before Doing</span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-semibold ${
                    askBeforeDoing ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.06] text-neutral-500'
                  }`}
                >
                  {askBeforeDoing ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          ) : (
            /* Collapsed rail mode indicator */
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <button
                onClick={() => onDeliveryModeChange?.(deliveryMode === 'smart' ? 'strict' : 'smart')}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition ${
                  deliveryMode === 'smart'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-white/[0.04] border-white/[0.1] text-white'
                }`}
                title={`Execution Mode: ${deliveryMode === 'smart' ? 'Smart (Click for Strict)' : 'Strict (Click for Smart)'}`}
              >
                {deliveryMode === 'smart' ? <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> : <Target className="w-3.5 h-3.5 text-neutral-300" />}
              </button>
              <button
                onClick={() => onAskBeforeDoingChange?.(!askBeforeDoing)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition ${
                  askBeforeDoing
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-black/40 border-white/[0.06] text-neutral-500'
                }`}
                title={`Ask Before Doing: ${askBeforeDoing ? 'ON (Click to disable)' : 'OFF (Click to enable)'}`}
              >
                <div className={`w-2 h-2 rounded-full ${askBeforeDoing ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
              </button>
            </div>
          )}
        </div>

        {/* Search Bar (only when open) */}
        {isOpen && (
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 transition font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Chat List Scroll Area */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 custom-scrollbar">
          {isLoading && chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-500 space-y-2">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              {isOpen && <span className="text-[11px] font-mono">Loading chats...</span>}
            </div>
          ) : filteredChats.length === 0 ? (
            isOpen && (
              <div className="text-center py-12 px-4 text-neutral-500 text-xs">
                {searchQuery ? (
                  <p>No chats matching &ldquo;{searchQuery}&rdquo;</p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-neutral-400 font-medium">No previous chats yet</p>
                    <p className="text-[11px] text-neutral-600">
                      Send your first prompt to initiate a continuous chat thread.
                    </p>
                  </div>
                )}
              </div>
            )
          ) : isOpen ? (
            Object.entries(grouped).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-semibold">
                    {label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((chat) => {
                      const isActive = currentChatId === chat.id;
                      const isEditing = editingId === chat.id;
                      const isConfirmingDelete = deletingId === chat.id;

                      return (
                        <div
                          key={chat.id}
                          onClick={() => onSelectChat(chat.id)}
                          className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-xs ${
                            isActive
                              ? 'bg-indigo-600/15 border border-indigo-500/30 text-white font-medium shadow-sm'
                              : 'hover:bg-white/[0.04] text-neutral-300 hover:text-white border border-transparent'
                          }`}
                        >
                          {/* Active Left Pill */}
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r" />
                          )}

                          <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
                            <MessageSquare
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive ? 'text-indigo-400' : 'text-neutral-500 group-hover:text-neutral-300'
                              }`}
                            />
                            {isEditing ? (
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(e as any, chat.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autoFocus
                                className="bg-black/80 border border-indigo-500/50 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-full"
                              />
                            ) : (
                              <div className="truncate">
                                <span className="block truncate leading-snug">{chat.title}</span>
                                {chat.preview && (
                                  <span className="block truncate text-[10px] text-neutral-500 font-normal mt-0.5">
                                    {chat.preview}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons on Hover */}
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={(e) => handleSaveRename(e, chat.id)}
                                  className="p-1 hover:text-emerald-400 transition"
                                  title="Save Title"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(null);
                                  }}
                                  className="p-1 hover:text-neutral-400 transition"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => handleStartRename(e, chat)}
                                  className="p-1 text-neutral-500 hover:text-neutral-200 transition"
                                  title="Rename Chat"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => handleDelete(e, chat.id)}
                                  className={`p-1 transition ${
                                    isConfirmingDelete
                                      ? 'text-rose-400 font-bold'
                                      : 'text-neutral-500 hover:text-rose-400'
                                  }`}
                                  title={isConfirmingDelete ? 'Click again to confirm delete' : 'Delete Chat'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            // Collapsed view icons
            <div className="space-y-2 flex flex-col items-center">
              {chats.slice(0, 15).map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition text-xs relative ${
                    currentChatId === chat.id
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'hover:bg-white/[0.04] text-neutral-400 hover:text-white'
                  }`}
                  title={chat.title}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions & Indicator */}
        <div className="p-3 border-t border-white/[0.06] shrink-0 bg-[#060709]/80">
          {isOpen ? (
            <div className="space-y-2">
              {/* Global Memory Button */}
              <button
                onClick={() => {
                  fetchMemory();
                  setIsMemoryModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/20 text-purple-300 transition text-xs font-medium group"
                title="View persistent memory extracted across conversations"
              >
                <div className="flex items-center gap-2 truncate">
                  <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="truncate">Persistent Memory</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-[10px] font-mono text-purple-300 border border-purple-500/30">
                  {((memoryData?.identity_and_business?.length || 0) +
                    (memoryData?.persistent_rules_and_preferences?.length || 0) +
                    (memoryData?.domain_entities_and_topics?.length || 0))}{' '}
                  facts
                </span>
              </button>

              {/* Clear All Chats Action */}
              {chats.length > 0 && (
                <div>
                  {confirmClearAll ? (
                    <div className="flex items-center gap-1.5 p-1 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      <button
                        onClick={handleClearAllChats}
                        className="flex-1 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition text-center"
                      >
                        Confirm Delete All
                      </button>
                      <button
                        onClick={() => setConfirmClearAll(false)}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-neutral-300 text-[10px] transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClearAll(true)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition text-xs"
                      title="Clear all chat history"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Clear All Chats</span>
                    </button>
                  )}
                </div>
              )}

              {/* Status Indicator */}
              <div className="flex items-center gap-2 text-neutral-400 text-xs px-2 pt-1 border-t border-white/[0.04]">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="truncate">
                  <span className="text-[11px] font-mono text-neutral-300 block truncate">
                    Context Retention Active
                  </span>
                  <span className="text-[10px] text-neutral-600 font-mono block">
                    Continuous Multi-Turn
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed Footer Icons */
            <div className="space-y-2 flex flex-col items-center">
              <button
                onClick={() => {
                  fetchMemory();
                  setIsMemoryModalOpen(true);
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition relative"
                title="Persistent Memory"
              >
                <Brain className="w-4 h-4" />
                {((memoryData?.identity_and_business?.length || 0) +
                  (memoryData?.persistent_rules_and_preferences?.length || 0) +
                  (memoryData?.domain_entities_and_topics?.length || 0)) > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 ring-2 ring-[#060709]" />
                )}
              </button>
              {chats.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all chat sessions?')) {
                      handleClearAllChats();
                    }
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-rose-500/15 text-neutral-500 hover:text-rose-400 transition"
                  title="Clear All Chats"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mt-1" title="Context Retention Active" />
            </div>
          )}
        </div>
      </aside>

      {/* Global Persistent Memory Modal */}
      {isMemoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#0b0d13] border border-purple-500/30 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-purple-500/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    Global Persistent Memory
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                      Self-Updating
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Unique to your user, shared across all chat sessions automatically.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMemoryModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-2.5 text-neutral-400">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  The moment you start a new conversation, the persistent memory system consolidates durable user identity facts and lifelong operational rules from previous conversations. Task-specific parameters (syllabus units, assignment questions, and file formats) are strictly filtered out and isolated inside Multi-Turn Session Memory.
                </p>
              </div>

              {/* Identity & Business Profile */}
              <div>
                <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span>🏢 User Identity & Business Profile</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    ({memoryData?.identity_and_business?.length || 0})
                  </span>
                </h4>
                {memoryData?.identity_and_business && memoryData.identity_and_business.length > 0 ? (
                  <ul className="space-y-1.5">
                    {memoryData.identity_and_business.map((fact, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/40 border border-purple-500/20 text-neutral-200">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/[0.04] text-neutral-500 italic">
                    No identity facts detected yet. (e.g. &quot;I have a cosmetic shop&quot;)
                  </div>
                )}
              </div>

              {/* Persistent Rules & Negative Constraints */}
              <div>
                <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span>🛡️ Persistent Rules & Negative Constraints</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    ({memoryData?.persistent_rules_and_preferences?.length || 0})
                  </span>
                </h4>
                {memoryData?.persistent_rules_and_preferences && memoryData.persistent_rules_and_preferences.length > 0 ? (
                  <ul className="space-y-1.5">
                    {memoryData.persistent_rules_and_preferences.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/40 border border-indigo-500/20 text-neutral-200">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/[0.04] text-neutral-500 italic">
                    No persistent rules detected yet. (e.g. &quot;Do not format day-wise, organize by topic&quot;)
                  </div>
                )}
              </div>

              {/* Domain Entities & Key Topics */}
              <div>
                <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span>🏷️ Domain Entities & Key Topics</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    ({memoryData?.domain_entities_and_topics?.length || 0})
                  </span>
                </h4>
                {memoryData?.domain_entities_and_topics && memoryData.domain_entities_and_topics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {memoryData.domain_entities_and_topics.map((topic, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px]">
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/[0.04] text-neutral-500 italic">
                    No persistent domain entities recorded yet.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-3.5 border-t border-white/[0.08] bg-black/40 flex items-center justify-between">
              <button
                onClick={handleClearMemory}
                className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Global Memory
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleConsolidateMemory}
                  disabled={isConsolidatingMemory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isConsolidatingMemory ? 'animate-spin' : ''}`} />
                  <span>{isConsolidatingMemory ? 'Consolidating...' : 'Sync From Chats'}</span>
                </button>
                <button
                  onClick={() => setIsMemoryModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-neutral-300 text-xs transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
