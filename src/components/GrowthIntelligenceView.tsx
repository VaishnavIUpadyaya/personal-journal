import React, { useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  TrendingUp, 
  Target, 
  AlertCircle, 
  CheckCircle2, 
  Lightbulb, 
  RefreshCw, 
  Clock,
  Compass
} from 'lucide-react';
import type { GrowthInsight } from '../types';
import { ApiClient } from '../lib/apiClient';
import { FirestoreService } from '../lib/firestoreService';
import { auth } from '../lib/firebaseClient';
import { formatDate } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

interface GrowthIntelligenceProps {
  insights: GrowthInsight[];
  onInsightGenerated: (newInsight: GrowthInsight) => void;
  entriesCount: number;
}

export const GrowthIntelligenceView: React.FC<GrowthIntelligenceProps> = ({
  insights,
  onInsightGenerated,
  entriesCount,
}) => {
  const [timeframe, setTimeframe] = useState<7 | 30 | 90>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(
    insights.length > 0 ? insights[0].id : null
  );

  const activeInsight = insights.find(i => i.id === selectedInsightId) || insights[0] || null;

  const handleGenerate = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('You must be signed in to generate growth intelligence.');
      return;
    }

    if (entriesCount === 0) {
      setError('You need at least one journal entry to generate growth intelligence.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Fetch user's entries strictly within timeframe from Firestore
      const entries = await FirestoreService.getEntriesInTimeframe(currentUser.uid, timeframe);

      if (entries.length === 0) {
        throw new Error(`No journal entries found in the last ${timeframe} days. Try selecting a wider timeframe or write an entry.`);
      }

      // Format payload for AI analysis
      const formattedEntries = entries.map(e => ({
        title: e.title,
        mood: e.mood,
        date: e.updatedAt || e.createdAt,
        preview: e.preview,
        summary: e.summary || '',
      }));

      // 2. Run cognitive pattern synthesis through server AI gateway
      const generatedInsight = await ApiClient.post<Omit<GrowthInsight, 'id' | 'userId' | 'generatedAt'>>(
        '/api/ai/growth-insights',
        {
          entries: formattedEntries,
          timeframeDays: timeframe,
        }
      );

      // 3. Save snapshot to Firestore
      const saved = await FirestoreService.saveGrowthInsight(currentUser.uid, {
        userId: currentUser.uid,
        generatedAt: new Date().toISOString(),
        ...generatedInsight,
      });

      onInsightGenerated(saved);
      setSelectedInsightId(saved.id);
    } catch (err) {
      setError((err as Error).message || 'Failed to generate Growth Intelligence report');
    } finally {
      setIsGenerating(false);
    }
  };

  const chartData = activeInsight?.recurringThemes.map((t) => ({
    name: t.theme.length > 18 ? t.theme.slice(0, 16) + '…' : t.theme,
    fullName: t.theme,
    score: t.frequency === 'high' ? 95 : t.frequency === 'moderate' ? 65 : 35,
    frequency: t.frequency,
  })) || [];

  const FREQ_COLORS = {
    high: '#4f46e5', // indigo-600
    moderate: '#0ea5e9', // sky-500
    emerging: '#10b981', // emerald-500
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              AI Cognitive Growth Engine
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Personal Growth Intelligence</h1>
            <p className="text-slate-300 text-sm mt-1 leading-relaxed">
              Analyzes recurring cognitive themes, emotional stability patterns, unstated blockers, and goal trajectory across your journal history.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700 flex">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeframe(days as 7 | 30 | 90)}
                  disabled={isGenerating}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    timeframe === days
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {days} Days
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || entriesCount === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-900/30 active:scale-98 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Synthesizing...' : 'Generate New Report'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleGenerate}
              className="text-white underline hover:no-underline font-medium ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Snapshot History Selector */}
      {insights.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <span className="text-xs font-medium text-slate-500 shrink-0 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> History:
          </span>
          {insights.map((ins, idx) => (
            <button
              key={`history-ins-${ins.id || ins.generatedAt}-${idx}`}
              onClick={() => setSelectedInsightId(ins.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 border transition cursor-pointer ${
                activeInsight?.id === ins.id
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {ins.timeframeLabel} • {formatDate(ins.generatedAt)}
            </button>
          ))}
        </div>
      )}

      {!activeInsight ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Compass className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No Growth Reports Generated Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Personal Growth Intelligence synthesizes your reflections to discover recurring life themes, mood dynamics, and forward-looking momentum.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || entriesCount === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {entriesCount === 0 ? 'Write Your First Entry First' : 'Generate First Report'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Dominant Mood</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold">
                  {activeInsight.moodPatterns.dominantMood}
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 capitalize">
                {activeInsight.moodPatterns.dominantMood}
              </div>
              <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                {activeInsight.moodPatterns.observations}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Emotional Stability</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">
                  {activeInsight.moodPatterns.stabilityScore} / 10
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900">
                Level {activeInsight.moodPatterns.stabilityScore} Equilibrium
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${(activeInsight.moodPatterns.stabilityScore / 10) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data Coverage</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-semibold">
                  {activeInsight.timeframeLabel}
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900">
                {activeInsight.entriesAnalyzedCount} Entries Analyzed
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Generated {formatDate(activeInsight.generatedAt)}
              </p>
            </div>
          </div>

          {/* Weekly Synthesis / Reflection Card */}
          <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-md border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Synthesized Reflection & Growth Summary</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line font-serif italic">
              "{activeInsight.weeklyReflection}"
            </p>
          </div>

          {/* Recurring Themes & Visual Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Recurring Cognitive Themes</h3>
                  </div>
                  <span className="text-xs text-slate-400">Pattern Prominence</span>
                </div>

                <div className="h-56 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#475569' }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs shadow-lg">
                                <p className="font-semibold">{data.fullName}</p>
                                <p className="text-slate-300 mt-1 capitalize">Frequency: {data.frequency}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                        {chartData.map((entry) => (
                          <Cell 
                            key={`cell-theme-${entry.fullName}-${entry.frequency}`} 
                            fill={FREQ_COLORS[entry.frequency as keyof typeof FREQ_COLORS] || '#4f46e5'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
                {activeInsight.recurringThemes.map((t, idx) => (
                  <div key={`theme-${t.theme}-${t.frequency}-${idx}`} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{t.theme}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold bg-white text-slate-600 border border-slate-200">
                        {t.frequency}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Goals and Identified Blockers */}
            <div className="space-y-6">
              {/* Goals */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Active Goals & Aspirations</h3>
                </div>
                <div className="space-y-2.5">
                  {activeInsight.goals.map((g, idx) => (
                    <div key={`goal-${g.goal}-${idx}`} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-900">{g.goal}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full capitalize bg-emerald-100 text-emerald-800 font-medium">
                            {g.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{g.context}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blockers & Remedies */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Observed Blockers & Remedies</h3>
                </div>
                <div className="space-y-2.5">
                  {activeInsight.blockers.map((b, idx) => (
                    <div key={`blocker-${b.blocker}-${idx}`} className="p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                      <div className="text-xs font-semibold text-amber-950">Friction: {b.blocker}</div>
                      <p className="text-[11px] text-amber-900 mt-1">
                        <strong className="text-amber-950 font-medium">Suggested Remedy:</strong> {b.suggestedRemedy}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Actionable Next Steps */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900">Actionable Momentum (Next 7 Days)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeInsight.actionableNextSteps.map((step, idx) => (
                <div key={`step-${step.step}-${idx}`} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Step 0{idx + 1}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                        step.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {step.priority} Priority
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{step.step}</p>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-200/60">
                    {step.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
