"use client";

import React, { useState, useEffect } from "react";
import {
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Cpu,
  X,
  Play,
} from "lucide-react";
import { api } from "@/lib/api";
import { ModelInfo, ModelPullProgress } from "@/types";

interface ModelDownloadModalProps {
  isOpen: boolean;
  modelsToDownload: Array<{
    name: string;
    provider: string;
    type?: string | null;
    ram_required?: string | null;
  }>;
  onClose: () => void;
  onAllCompleted?: () => void;
  onComplete?: () => void;
}

export function ModelDownloadModal({
  isOpen,
  modelsToDownload,
  onClose,
  onAllCompleted,
  onComplete,
}: ModelDownloadModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelPullProgress>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [completedModels, setCompletedModels] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && modelsToDownload.length > 0 && !isDownloading) {
      startSequentialDownloads();
    }
  }, [isOpen, modelsToDownload]);

  const startSequentialDownloads = async () => {
    setIsDownloading(true);
    setErrorMessage(null);
    setCompletedModels([]);

    for (let i = 0; i < modelsToDownload.length; i++) {
      const target = modelsToDownload[i];
      setCurrentIndex(i);

      try {
        await api.pullModelStream(
          target.name,
          target.provider as any,
          (progress) => {
            setDownloadProgress((prev) => ({
              ...prev,
              [target.name]: progress,
            }));

            if (progress.status === "success" || progress.percentage === 100) {
              setCompletedModels((prev) => (prev.includes(target.name) ? prev : [...prev, target.name]));
            }
          },
          (err) => {
            setErrorMessage(`Failed downloading ${target.name}: ${err.message || err}`);
          }
        );
      } catch (err: any) {
        setErrorMessage(`Failed to pull ${target.name}: ${err.message || err}`);
        setIsDownloading(false);
        return;
      }
    }

    setIsDownloading(false);
    // Short delay for visual confirmation before firing completion
    setTimeout(() => {
      if (onAllCompleted) onAllCompleted();
      else if (onComplete) onComplete();
    }, 1000);
  };

  if (!isOpen || modelsToDownload.length === 0) return null;

  const currentModel = modelsToDownload[currentIndex] || modelsToDownload[0];
  const currentProg = downloadProgress[currentModel?.name];
  const pct = currentProg?.percentage ?? (completedModels.includes(currentModel?.name) ? 100 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Download className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Preparing Models for Evaluation
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Downloading required local weights before launching the experiment matrix.
              </p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Model Queue List */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Models in Queue ({completedModels.length}/{modelsToDownload.length} Ready)
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {modelsToDownload.map((m, idx) => {
              const isDone = completedModels.includes(m.name);
              const isCurrent = idx === currentIndex && isDownloading;
              const p = downloadProgress[m.name];

              return (
                <div
                  key={m.name}
                  className={`p-3 rounded-xl border transition flex items-center justify-between ${
                    isDone
                      ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                      : isCurrent
                      ? "bg-indigo-950/30 border-indigo-500/50 text-indigo-200 shadow-sm shadow-indigo-500/10"
                      : "bg-slate-800/40 border-slate-700/50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                    ) : (
                      <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold truncate text-slate-200">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>Provider: {m.provider}</span>
                        {m.ram_required && <span>• {m.ram_required}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isDone ? (
                      <span className="text-xs font-medium text-emerald-400">Downloaded</span>
                    ) : isCurrent ? (
                      <span className="text-xs font-mono font-medium text-indigo-400">
                        {p?.percentage !== undefined && p?.percentage !== null
                          ? `${p.percentage}%`
                          : p?.status || "Downloading..."}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Queued</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Progress Card */}
        {isDownloading && currentModel && (
          <div className="p-4 bg-slate-950/60 rounded-xl border border-indigo-500/20 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                Downloading <span className="text-indigo-400 font-mono">{currentModel.name}</span>
              </span>
              <span className="font-mono text-indigo-300 font-semibold">{pct}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/60">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Status: {currentProg?.status || "Fetching layers..."}</span>
              {currentProg?.speed_formatted && (
                <span className="font-mono text-slate-300">{currentProg.speed_formatted}</span>
              )}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">Download Failed</div>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {errorMessage ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={startSequentialDownloads}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Download
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              disabled={isDownloading}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
