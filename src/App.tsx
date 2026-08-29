import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Sparkles, 
  ShieldCheck, 
  LogOut, 
  Plus, 
  MessageSquare, 
  Calendar, 
  Smile, 
  Trash2, 
  Download, 
  RefreshCw, 
  TrendingUp, 
  Lock,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { auth, signInWithGoogle, logOut, onAuthStateChanged, type User } from './lib/firebaseClient';
import { FirestoreService } from './lib/firestoreService';
import type { JournalEntry, GrowthInsight } from './types';
import { formatDate } from './lib/utils';
import { SecurityModal } from './components/SecurityModal';
import { GrowthIntelligenceView } from './components/GrowthIntelligenceView';
import { JournalThreadView } from './components/JournalThreadView';
import { CreateEntryModal } from './components/CreateEntryModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'journal' | 'growth'>('journal');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [insights, setInsights] = useState<GrowthInsight[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Reference to cleanup active Firestore snapshot listeners immediately
  const activeUnsubscribesRef = React.useRef<{
    entries: (() => void) | null;
    insights: (() => void) | null;
  }>({
    entries: null,
    insights: null,
  });

  const cleanupActiveSubscriptions = React.useCallback(() => {
    if (activeUnsubscribesRef.current.entries) {
      try {
        activeUnsubscribesRef.current.entries();
      } catch {
        // Handled cleanup
      }
      activeUnsubscribesRef.current.entries = null;
    }
    if (activeUnsubscribesRef.current.insights) {
      try {
        activeUnsubscribesRef.current.insights();
      } catch {
        // Handled cleanup
      }
      activeUnsubscribesRef.current.insights = null;
    }
  }, []);

  // Auth & Real-Time Sync Observers
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // 1. Immediately unsubscribe any previous user's listeners before state updates
      cleanupActiveSubscriptions();

      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        setIsDataLoading(true);
        setError(null);

        // Sync User Profile in Firestore
        try {
          await FirestoreService.syncUserProfile(currentUser);
        } catch (syncErr) {
          console.warn('User profile sync notice:', syncErr);
        }

        // Real-time Firestore entries subscription for the authenticated user
        const unsubEntries = FirestoreService.subscribeEntries(
          currentUser.uid,
          (liveEntries) => {
            setEntries(liveEntries);
            setIsDataLoading(false);
          },
          (err) => {
            if (auth.currentUser) {
              console.error('Entries subscription error:', err);
              setError(err.message || 'Failed to sync journal entries');
            }
            setIsDataLoading(false);
          }
        );

        // Real-time Firestore insights subscription for the authenticated user
        const unsubInsights = FirestoreService.subscribeInsights(
          currentUser.uid,
          (liveInsights) => {
            setInsights(liveInsights);
          },
          (err) => {
            if (auth.currentUser) {
              console.warn('Insights subscription notice:', err);
            }
          }
        );

        activeUnsubscribesRef.current = {
          entries: unsubEntries,
          insights: unsubInsights,
        };
      } else {
        // Clear all user-specific state upon sign out
        setEntries([]);
        setInsights([]);
        setSelectedEntryId(null);
        setError(null);
        setIsDataLoading(false);
      }
    });

    return () => {
      cleanupActiveSubscriptions();
      unsubscribeAuth();
    };
  }, [cleanupActiveSubscriptions]);

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError((err as Error).message || 'Google Sign-In failed');
    }
  };

  const handleSignOut = async () => {
    try {
      // Unsubscribe all active listeners immediately before executing logout
      cleanupActiveSubscriptions();
      setEntries([]);
      setInsights([]);
      setSelectedEntryId(null);
      setError(null);
      await logOut();
    } catch (err) {
      setError((err as Error).message || 'Logout failed');
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const data = await FirestoreService.exportAllUserData(user.uid, user.email || '');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-gemini-journal-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteEntry = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    if (!window.confirm('Delete this journal entry permanently?')) return;

    try {
      await FirestoreService.deleteEntry(user.uid, id);
      if (selectedEntryId === id) setSelectedEntryId(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to delete entry');
    }
  };

  // Auth Loading State
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 animate-pulse">
          <Sparkles className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-400">Securing Personal Journal Session...</p>
      </div>
    );
  }

  // Public Landing / Sign-in State
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-indigo-600/15 blur-[120px] pointer-events-none rounded-full" />
        
        {/* Navigation */}
        <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/40">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">Personal Gemini Journal</span>
          </div>

          <button
            onClick={() => setIsSecurityOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Privacy & Security Architecture
          </button>
        </header>

        {/* Hero Section */}
        <main className="relative z-10 max-w-3xl mx-auto px-6 py-12 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Cloud Run Gateway • Verified Firebase Auth • Gemini Resilient Engine
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight mb-4">
            Private Multi-Turn AI Reflections & Personal Growth Intelligence
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed mb-8">
            An encrypted, per-user isolated space for mindful dialogue, automatic executive summaries, and longitudinal cognitive pattern discovery.
          </p>

          {error && (
            <div className="mb-6 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSignIn}
            className="inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 text-sm font-bold shadow-xl shadow-white/10 hover:shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google Account
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-14 text-left">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <Lock className="w-5 h-5 text-indigo-400 mb-2" />
              <div className="font-semibold text-xs text-white">Strict Per-User Isolation</div>
              <p className="text-[11px] text-slate-400 mt-1">Zero cross-user data visibility, verified server-side with Firebase tokens.</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <Sparkles className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="font-semibold text-xs text-white">Growth Intelligence</div>
              <p className="text-[11px] text-slate-400 mt-1">Longitudinal theme analysis, emotional patterns, and active goal extraction.</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <ShieldCheck className="w-5 h-5 text-cyan-400 mb-2" />
              <div className="font-semibold text-xs text-white">Zero Client Credentials</div>
              <p className="text-[11px] text-slate-400 mt-1">Gemini API keys managed exclusively in Google Cloud Secret Manager.</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 text-center text-xs text-slate-500 border-t border-slate-900">
          Personal Gemini Journal • Built on Cloud Run, Firestore & Gemini 3 Models
        </footer>

        <SecurityModal isOpen={isSecurityOpen} onClose={() => setIsSecurityOpen(false)} />
      </div>
    );
  }

  // Authenticated Dashboard Layout
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 tracking-tight block">Personal Gemini Journal</span>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Isolated Vault Active
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => {
                  setActiveTab('journal');
                  setSelectedEntryId(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'journal'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 inline mr-1.5" />
                Journal Entries ({entries.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('growth');
                  setSelectedEntryId(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'growth'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" />
                Growth Intelligence
              </button>
            </nav>
          </div>

          {/* User Controls & Security Info */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSecurityOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Privacy Architecture
            </button>

            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 text-xs transition cursor-pointer"
              title="Export your journal data as JSON"
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
            </button>

            {/* Profile Avatar & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border border-indigo-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <div className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">
                  {user.displayName || user.email?.split('@')[0]}
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ml-1"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="sm:hidden flex border-t border-slate-200 p-1.5 bg-slate-50 justify-around text-xs">
          <button
            onClick={() => {
              setActiveTab('journal');
              setSelectedEntryId(null);
            }}
            className={`px-4 py-1.5 rounded-lg font-medium cursor-pointer ${
              activeTab === 'journal' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600'
            }`}
          >
            Journal ({entries.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('growth');
              setSelectedEntryId(null);
            }}
            className={`px-4 py-1.5 rounded-lg font-medium cursor-pointer ${
              activeTab === 'growth' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600'
            }`}
          >
            Growth Intelligence
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* VIEW 1: ACTIVE THREAD CHAT */}
        {selectedEntryId ? (
          <JournalThreadView
            entryId={selectedEntryId}
            onBack={() => setSelectedEntryId(null)}
            onEntryUpdated={(updated) => {
              setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
            }}
            onEntryDeleted={(deletedId) => {
              setEntries(prev => prev.filter(e => e.id !== deletedId));
              setSelectedEntryId(null);
            }}
          />
        ) : activeTab === 'growth' ? (
          /* VIEW 2: PERSONAL GROWTH INTELLIGENCE */
          <GrowthIntelligenceView
            insights={insights}
            entriesCount={entries.length}
            onInsightGenerated={(newIns) => {
              setInsights(prev => {
                if (prev.some(i => i.id === newIns.id)) {
                  return prev.map(i => i.id === newIns.id ? newIns : i);
                }
                return [newIns, ...prev];
              });
            }}
          />
        ) : (
          /* VIEW 3: JOURNAL LIST & CARDS */
          <div className="space-y-6">
            {/* Top Action Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Your Private Reflections</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-turn conversations with Gemini are saved directly in your isolated cloud vault.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-98 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Reflection
                </button>
              </div>
            </div>

            {/* Empty State */}
            {entries.length === 0 && !isDataLoading ? (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-2xs">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl text-indigo-600 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Start Your First Journal Reflection</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
                  Reflect on your day, explore challenges, or capture insights. Gemini will converse with you and synthesize key themes.
                </p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl transition shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create First Entry
                </button>
              </div>
            ) : (
              /* Entry Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {entries.map((entry, idx) => (
                  <div
                    key={entry.id ? `entry-${entry.id}` : `entry-${entry.createdAt}-${idx}`}
                    onClick={() => setSelectedEntryId(entry.id)}
                    className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      {/* Card Top Row */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2.5">
                        <span className="flex items-center gap-1 font-medium text-slate-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(entry.createdAt)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[10px] flex items-center gap-1">
                            <Smile className="w-2.5 h-2.5 text-indigo-500" />
                            {entry.mood}
                          </span>
                          <button
                            onClick={(e) => handleDeleteEntry(entry.id, e)}
                            className="text-slate-300 hover:text-rose-600 p-1 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Preview */}
                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition line-clamp-1 mb-1.5">
                        {entry.title || 'Journal Reflection'}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-3">
                        {entry.summary || entry.preview}
                      </p>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1 text-slate-400">
                        <MessageSquare className="w-3 h-3 text-indigo-400" />
                        <span>{entry.turnCount || 1} turns</span>
                      </div>

                      <div className="flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-1 transition-transform">
                        <span>Continue dialogue</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Modals */}
      <CreateEntryModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onEntryCreated={(newEntry) => {
          setSelectedEntryId(newEntry.id);
        }}
      />

      <SecurityModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
      />
    </div>
  );
}
