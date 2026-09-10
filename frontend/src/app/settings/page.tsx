"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { ModelStatusBadge } from "@/components/ModelStatusBadge";
import {
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Key,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

export default function SettingsProvidersPage() {
  const queryClient = useQueryClient();
  const { userApiKeys, setUserApiKey } = useAppStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Model pull state
  const [customModelInput, setCustomModelInput] = useState<string>("");
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{ status: string; percentage?: number | null; speed?: string | null }>({
    status: "",
  });

  const { data: providers, isLoading: loadingProviders } = useQuery({
    queryKey: ["providers"],
    queryFn: api.getProviders,
  });

  const { data: models, isLoading: loadingModels, refetch: refetchModels } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.getModels(),
    refetchInterval: 10000,
  });

  const deleteModelMutation = useMutation({
    mutationFn: (modelName: string) => api.deleteModel(modelName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  const handlePullModel = async (modelName: string, provider: "ollama" | "fastembed" = "ollama") => {
    if (!modelName.trim()) return;
    const target = modelName.trim();
    setPullingModel(target);
    setPullProgress({ status: "Starting download..." });

    try {
      await api.pullModelStream(
        target,
        provider,
        (progress) => {
          setPullProgress({
            status: progress.status,
            percentage: progress.percentage,
            speed: progress.speed_formatted,
          });
        },
        (err) => {
          alert(`Download error: ${err.message || err}`);
        }
      );
      setCustomModelInput("");
      queryClient.invalidateQueries({ queryKey: ["models"] });
    } catch (err: any) {
      alert(`Download failed: ${err.message || err}`);
    } finally {
      setPullingModel(null);
      setPullProgress({ status: "" });
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // Compute downloaded storage
  const downloadedModels = models?.filter((m) => m.is_downloaded) || [];
  const totalSizeBytes = downloadedModels.reduce((acc, m) => acc + (m.size_bytes || 0), 0);
  const totalSizeFormatted =
    totalSizeBytes > 1024 * 1024 * 1024
      ? `${(totalSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Models & Provider Settings</h2>
        <p className="text-xs text-slate-400 mt-1">
          Inspect installed local models, download new weights on-demand, or configure cloud API keys.
        </p>
      </div>

      {/* SECTION 1: Local Model Manager */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Local Model Registry</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {downloadedModels.length} Installed
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Models cached locally in Ollama and FastEmbed ONNX runtime. Total disk used:{" "}
                <strong className="text-slate-200 font-mono">{totalSizeFormatted}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => refetchModels()}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* 1-Click Pull or Custom Input */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            <span>Download New Model (Ollama / HuggingFace)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. qwen2.5:3b, mistral:7b, phi3:mini, nomic-embed-text"
              value={customModelInput}
              disabled={!!pullingModel}
              onChange={(e) => setCustomModelInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 outline-none focus:border-indigo-500"
            />
            <button
              disabled={!customModelInput.trim() || !!pullingModel}
              onClick={() => handlePullModel(customModelInput)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition"
            >
              {pullingModel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Pull Model</span>
                </>
              )}
            </button>
          </div>

          {/* Active Download Status Bar */}
          {pullingModel && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-indigo-300">
                  Downloading <strong>{pullingModel}</strong>: {pullProgress.status}
                </span>
                <span className="text-slate-400">
                  {pullProgress.percentage !== undefined && pullProgress.percentage !== null
                    ? `${pullProgress.percentage}%`
                    : ""}
                </span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, pullProgress.percentage || 5)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Model Catalog Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Available & Installed Models Catalog
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {models?.map((m) => (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border transition flex items-center justify-between ${
                  m.is_downloaded
                    ? "bg-slate-900/60 border-slate-800/90 text-white"
                    : "bg-slate-950/40 border-slate-800/40 text-slate-400 opacity-80"
                }`}
              >
                <div className="min-w-0 pr-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-200">{m.name}</span>
                    <ModelStatusBadge model={m} />
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{m.description}</p>
                  <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                    <span>Type: {m.type.toUpperCase()}</span>
                    {m.ram_required && <span>• {m.ram_required}</span>}
                    {m.parameter_size && <span>• {m.parameter_size}</span>}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {!m.is_downloaded ? (
                    <button
                      disabled={!!pullingModel}
                      onClick={() => handlePullModel(m.name, m.provider as any)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  ) : m.provider === "ollama" ? (
                    <button
                      disabled={deleteModelMutation.isPending}
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete ${m.name} to free disk space?`)) {
                          deleteModelMutation.mutate(m.name);
                        }
                      }}
                      title="Delete model to reclaim disk space"
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: Cloud Provider API Keys */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Cloud Provider API Keys</h3>
            <p className="text-xs text-slate-400">
              Optional session keys for OpenAI, Anthropic, Google Gemini, and Groq cloud models.
            </p>
          </div>
        </div>

        {/* Security Callout */}
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex items-start space-x-3 text-xs text-slate-300">
          <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            Keys provided in your server <code className="text-indigo-300 font-mono">.env</code> are active globally.
            Keys entered below only override for your browser session and are never saved to plain database storage.
          </div>
        </div>

        {/* Provider List */}
        <div className="space-y-4">
          {providers
            ?.filter((p) => p.requires_api_key)
            .map((p) => {
              const currentKey = userApiKeys[p.provider] || "";
              const isVisible = showKeys[p.provider] || false;

              return (
                <div
                  key={p.provider}
                  className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{p.name} API Key</span>
                      {p.is_configured && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="h-3 w-3" /> Configured in .env
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center">
                    <input
                      type={isVisible ? "text" : "password"}
                      placeholder={p.is_configured ? "Using global .env key (enter custom key to override)" : "sk-..."}
                      value={currentKey}
                      onChange={(e) => setUserApiKey(p.provider, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono pr-10 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(p.provider)}
                      className="absolute right-3 text-slate-400 hover:text-white"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          {savedSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <Check className="h-3.5 w-3.5" /> API keys updated successfully!
            </span>
          )}
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center space-x-2 shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Save className="h-4 w-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </div>
    </div>
  );
}

