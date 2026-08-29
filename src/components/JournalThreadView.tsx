import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Send, 
  Sparkles, 
  Tag, 
  Smile, 
  Trash2, 
  Bot, 
  User, 
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import type { JournalEntry, JournalMessage } from '../types';
import { ApiClient } from '../lib/apiClient';
import { FirestoreService } from '../lib/firestoreService';
import { auth } from '../lib/firebaseClient';
import { formatDate } from '../lib/utils';

interface JournalThreadProps {
  entryId: string;
  onBack: () => void;
  onEntryUpdated: (updated: JournalEntry) => void;
  onEntryDeleted: (deletedId: string) => void;
}

export const JournalThreadView: React.FC<JournalThreadProps> = ({
  entryId,
  onBack,
  onEntryUpdated,
  onEntryDeleted,
}) => {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummarySuccess, setShowSummarySuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUser = auth.currentUser;

  // Real-time subscription to messages
  useEffect(() => {
    if (!currentUser || !entryId) {
      setEntry(null);
      setMessages([]);
      return;
    }

    let isMounted = true;

    // Fetch parent entry
    FirestoreService.getEntry(currentUser.uid, entryId)
      .then((data) => {
        if (isMounted && data) setEntry(data);
      })
      .catch(() => {
        // Handled silently during logout/navigation teardown
      });

    const unsubscribe = FirestoreService.subscribeMessages(
      currentUser.uid,
      entryId,
      (msgs) => {
        if (isMounted) setMessages(msgs);
      },
      (err) => {
        if (isMounted && auth.currentUser) {
          setError(err.message || 'Failed to load conversation thread');
        }
      }
    );

    return () => {
      isMounted = false;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // Handled cleanup
        }
      }
    };
  }, [currentUser?.uid, entryId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending || !currentUser) return;

    const messageText = inputMessage.trim();
    setInputMessage('');
    setIsSending(true);
    setError(null);

    try {
      // 1. Call server-side AI turn endpoint with conversation history
      const historyPayload = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const aiRes = await ApiClient.post<{
        content: string;
        modelUsed?: string;
      }>('/api/ai/turn', {
        history: historyPayload,
        newMessage: messageText,
      });

      const now = new Date().toISOString();
      const newTurnCount = (entry?.turnCount || 1) + 1;

      // 2. Persist turn directly into Firestore
      await FirestoreService.addTurnMessages(
        currentUser.uid,
        entryId,
        {
          entryId,
          userId: currentUser.uid,
          role: 'user',
          content: messageText,
          timestamp: now,
        },
        {
          entryId,
          userId: currentUser.uid,
          role: 'model',
          content: aiRes.content,
          timestamp: new Date(Date.now() + 50).toISOString(),
          modelUsed: aiRes.modelUsed,
        },
        newTurnCount
      );

      if (entry) {
        const updated = { ...entry, turnCount: newTurnCount, updatedAt: now };
        setEntry(updated);
        onEntryUpdated(updated);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to generate response. Your input was restored.');
      setInputMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const handleSummarize = async () => {
    if (isSummarizing || !currentUser) return;
    setIsSummarizing(true);
    setError(null);

    try {
      const dialogueText = messages
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const res = await ApiClient.post<{
        summary: string;
        mood: JournalEntry['mood'];
        tags: string[];
      }>('/api/ai/summarize', { dialogue: dialogueText });

      await FirestoreService.updateEntry(currentUser.uid, entryId, {
        summary: res.summary,
        mood: res.mood,
        tags: res.tags,
      });

      if (entry) {
        const updated: JournalEntry = {
          ...entry,
          summary: res.summary,
          mood: res.mood,
          tags: res.tags,
          updatedAt: new Date().toISOString(),
        };
        setEntry(updated);
        onEntryUpdated(updated);
        setShowSummarySuccess(true);
        setTimeout(() => setShowSummarySuccess(false), 4000);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to generate automatic summary');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to permanently delete this journal entry?')) return;
    try {
      await FirestoreService.deleteEntry(currentUser.uid, entryId);
      onEntryDeleted(entryId);
    } catch (err) {
      setError((err as Error).message || 'Failed to delete entry');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[550px] bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition shrink-0 cursor-pointer"
            title="Back to Journal List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {entry?.title || 'Journal Reflection'}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span>{entry?.createdAt ? formatDate(entry.createdAt) : ''}</span>
              <span>•</span>
              <span className="capitalize flex items-center gap-1 font-medium text-slate-700">
                <Smile className="w-3 h-3 text-indigo-500" />
                {entry?.mood}
              </span>
              <span>•</span>
              <span>{messages.length} messages</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSummarize}
            disabled={isSummarizing || messages.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-medium transition cursor-pointer"
            title="Generate structured AI summary and tags"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSummarizing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSummarizing ? 'Summarizing...' : 'Summarize'}</span>
          </button>

          <button
            onClick={handleDelete}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition cursor-pointer"
            title="Delete this entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Structured Summary & Tags Banner */}
      {entry?.summary && (
        <div className="bg-indigo-50/70 border-b border-indigo-100/90 p-4 px-5 shrink-0 text-xs text-indigo-950 flex flex-col md:flex-row md:items-start justify-between gap-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-900 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Executive AI Summary</span>
            </div>
            <p className="text-slate-700 text-xs sm:text-[13px] leading-relaxed break-words whitespace-normal">
              {entry.summary}
            </p>
          </div>
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap shrink-0 md:max-w-xs md:justify-end pt-1 md:pt-0">
              {entry.tags.map((tag, idx) => (
                <span
                  key={`tag-${entry.id || 'entry'}-${tag}-${idx}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs"
                >
                  <Tag className="w-2.5 h-2.5 shrink-0" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showSummarySuccess && (
        <div className="bg-emerald-50 border-b border-emerald-100 p-2.5 px-5 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          AI conversation summary and mood tags updated successfully!
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border-b border-rose-100 p-2.5 px-5 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-semibold underline ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Conversation Thread Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id ? `msg-${msg.id}` : `msg-${msg.role}-${msg.timestamp || ''}-${idx}`}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                  isUser
                    ? 'bg-slate-900 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-2xs text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-slate-900 text-slate-100 rounded-tr-xs'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                <div
                  className={`mt-2 flex items-center justify-between text-[10px] ${
                    isUser ? 'text-slate-400' : 'text-slate-400'
                  }`}
                >
                  <span>{msg.timestamp ? formatDate(msg.timestamp) : ''}</span>
                  {msg.modelUsed && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono text-[9px]">
                      {msg.modelUsed}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 animate-pulse" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-xs p-4 border border-slate-200 text-xs text-slate-500 shadow-2xs flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              <span>Gemini is reflecting on your entry...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Turn Input Box */}
      <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Deepen your reflection or ask a follow-up question..."
            disabled={isSending}
            className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isSending}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shadow-2xs transition active:scale-95 shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
