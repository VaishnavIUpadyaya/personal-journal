import React from 'react';
import { ShieldCheck, Lock, Key, Database, RefreshCw, EyeOff, Server } from 'lucide-react';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Privacy & Data Isolation Architecture</h2>
              <p className="text-xs text-slate-500">How your personal reflections and data are protected</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 text-sm font-medium transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
              <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Strict Per-User Isolation</h3>
                <p className="text-xs text-slate-600 mt-1">
                  All reflections, conversation messages, and growth reports are partitioned under your own isolated path: <code className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-[11px]">/users/&#123;your-uid&#125;/**</code>.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
              <Database className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Cloud Run Backend Gateway</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Every request requires a cryptographically verified Firebase Auth Bearer token. The backend never accepts client-provided user IDs.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
              <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Zero Client-Side Secrets</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Your Gemini API keys and cloud credentials reside exclusively in Google Cloud Secret Manager on the server. No secrets are bundled in the client code.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
              <Server className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Resilient Model Fallback Ladder</h3>
                <p className="text-xs text-slate-600 mt-1">
                  AI generations automatically failover across high-availability Gemini models (3.7-Flash ➔ 3.1-Flash-Lite ➔ latest alias) for 99.9% uptime.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100">
            <h4 className="font-semibold text-indigo-950 flex items-center gap-2 mb-2">
              <EyeOff className="w-4 h-4 text-indigo-600" />
              Personal Growth Intelligence Privacy Boundary
            </h4>
            <p className="text-xs text-indigo-900 leading-relaxed">
              When Personal Growth Intelligence scans your journal history (7, 30, or 90-day windows), it queries <strong>strictly and exclusively</strong> your personal journal records. No cross-user aggregations, global queries, or external data sharing take place.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
              Defense-in-depth Firestore Security Rules active
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
