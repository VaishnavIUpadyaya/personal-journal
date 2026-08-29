import React, { useState } from 'react';
import { Sparkles, PenLine, X, AlertCircle } from 'lucide-react';
import type { JournalMood, JournalEntry } from '../types';
import { ApiClient } from '../lib/apiClient';
import { FirestoreService } from '../lib/firestoreService';
import { auth } from '../lib/firebaseClient';

interface CreateEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEntryCreated: (entry: JournalEntry) => void;
}

const MOOD_OPTIONS: Array<{ value: JournalMood; label: string; emoji: string }> = [
  { value: 'reflective', label: 'Reflective', emoji: '🤔' },
  { value: 'energized', label: 'Energized', emoji: '⚡' },
  { value: 'calm', label: 'Calm', emoji: '🌿' },
  { value: 'challenged', label: 'Challenged', emoji: '🏔️' },
  { value: 'grateful', label: 'Grateful', emoji: '🙏' },
  { value: 'focused', label: 'Focused', emoji: '🎯' },
];

const PROMPT_INSPIRATIONS = [
  'What was a key breakthrough or friction point I encountered today?',
  'What decision am I wrestling with, and what values are driving it?',
  'What am I deeply grateful for today that I usually take for granted?',
  'What is an unstated goal I want to recommit to this week?',
];

export const CreateEntryModal: React.FC<CreateEntryModalProps> = ({
  isOpen,
  onClose,
  onEntryCreated,
}) => {
  const [promptText, setPromptText] = useState('');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<JournalMood>('reflective');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || isSubmitting) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('You must be signed in to create an entry');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Call Server-side AI endpoint to generate initial reflection and metadata
      const aiResult = await ApiClient.post<{
        title: string;
        preview: string;
        summary: string;
        mood: JournalMood;
        tags: string[];
        modelResponse: string;
        modelUsed?: string;
      }>('/api/ai/initial-reflection', {
        prompt: promptText.trim(),
        title: title.trim() || undefined,
        mood,
      });

      const now = new Date().toISOString();

      // 2. Persist directly to Firestore under authenticated user's isolated path
      const entryData = {
        userId: currentUser.uid,
        title: aiResult.title,
        preview: aiResult.preview,
        summary: aiResult.summary,
        mood: aiResult.mood,
        tags: aiResult.tags,
        turnCount: 1,
        createdAt: now,
        updatedAt: now,
      };

      const userMsg = {
        entryId: '',
        userId: currentUser.uid,
        role: 'user' as const,
        content: promptText.trim(),
        timestamp: now,
      };

      const modelMsg = {
        entryId: '',
        userId: currentUser.uid,
        role: 'model' as const,
        content: aiResult.modelResponse,
        timestamp: new Date(Date.now() + 50).toISOString(),
        modelUsed: aiResult.modelUsed,
      };

      const created = await FirestoreService.createEntryWithMessages(
        currentUser.uid,
        entryData,
        userMsg,
        modelMsg
      );

      onEntryCreated(created);
      onClose();
      setPromptText('');
      setTitle('');
    } catch (err) {
      setError((err as Error).message || 'Failed to create entry and generate reflection');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <PenLine className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">New Journal Reflection</h3>
              <p className="text-xs text-slate-500">Gemini will converse, synthesize, and tag your entry</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Current Mood State
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMood(m.value)}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    mood === m.value
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">{m.emoji}</span>
                  <span className="text-[11px] font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Entry Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekly Retrospective or Creative Spark"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Your Reflection / Thoughts <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">{promptText.length} chars</span>
            </div>
            <textarea
              rows={5}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Unpack your day, explore an idea, or detail a challenge you are navigating..."
              required
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Quick Prompts */}
          <div>
            <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-2">
              <Sparkles className="w-3 h-3 text-indigo-500" /> Need inspiration?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_INSPIRATIONS.map((insp) => (
                <button
                  type="button"
                  key={`insp-${insp}`}
                  onClick={() => setPromptText(insp)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200/60 transition text-left cursor-pointer"
                >
                  {insp}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!promptText.trim() || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition shadow-md shadow-indigo-600/20 active:scale-98 cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              {isSubmitting ? 'Reflecting with Gemini...' : 'Begin Reflection Dialogue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
