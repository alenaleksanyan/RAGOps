"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { ModelStatusBadge } from "@/components/ModelStatusBadge";
import { ModelDownloadModal } from "@/components/ModelDownloadModal";
import {
  Boxes,
  Check,
  Cpu,
  Database,
  FlaskConical,
  Layers,
  Loader2,
  Play,
  Settings2,
  Sparkles,
  FileCode,
  Terminal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  X,
  Grid,
  Award,
  Activity,
  Pause,
  Square,
  ExternalLink,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { ExperimentRun } from "@/types";

const DEFAULT_SYSTEM_PROMPT = `You are an accurate, domain-specialized AI assistant. Answer the user's question using ONLY the provided context passages.
If the answer cannot be determined strictly from the context, state clearly what is missing or that the context does not contain enough information.`;

export default function MatrixBuilderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userApiKeys } = useAppStore();

  const [highlightPareto, setHighlightPareto] = useState<boolean>(true);
  const [hoveredCell, setHoveredCell] = useState<{
    id: string;
    variant: string;
    faithfulness: number;
    recall: number;
    latency: string;
    cost: string;
    reranker: string;
  } | null>(null);

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [matrixName, setMatrixName] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [showPromptAccordion, setShowPromptAccordion] = useState<boolean>(false);

  // Matrix selections
  const [selectedStrategies, setSelectedStrategies] = useState<any[]>([
    { type: "recursive", chunk_size: 500, chunk_overlap: 50 },
    { type: "semantic", threshold: 0.75 },
  ]);
  const [selectedEmbeddings, setSelectedEmbeddings] = useState<string[]>([
    "BAAI/bge-small-en-v1.5",
  ]);
  const [selectedKVals, setSelectedKVals] = useState<number[]>([3, 5]);
  const [customKInput, setCustomKInput] = useState<string>("");
  const [selectedRerankers, setSelectedRerankers] = useState<(string | null)[]>([null]);
  const [selectedLLMs, setSelectedLLMs] = useState<string[]>(["llama3.2"]);

  const handleAddCustomK = () => {
    const parsed = parseInt(customKInput.trim(), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      if (!selectedKVals.includes(parsed)) {
        setSelectedKVals([...selectedKVals, parsed].sort((a, b) => a - b));
      }
      setCustomKInput("");
    }
  };

  const handleRemoveK = (k: number) => {
    setSelectedKVals(selectedKVals.filter((item) => item !== k));
  };

  // Download modal state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [modelsToDownload, setModelsToDownload] = useState<any[]>([]);

  // Auto-selection initialization flag
  const [hasInitializedModels, setHasInitializedModels] = useState(false);

  // Real backend queries
  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.getDatasets,
  });

  const { data: allModels } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.getModels(),
    refetchInterval: 10000,
  });

  const { data: experiments } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.getExperiments(),
    refetchInterval: 3000,
  });

  const { data: tradeoffPoints } = useQuery({
    queryKey: ["tradeoffs"],
    queryFn: () => api.getTradeOffPoints(),
    refetchInterval: 5000,
  });

  // Identify active running or pending sweep run
  const activeRun = useMemo(() => {
    return experiments?.find((e) => e.status === "RUNNING" || e.status === "PENDING");
  }, [experiments]);

  // Real status polling for active sweep
  const { data: activeStatus } = useQuery({
    queryKey: ["experiment-status", activeRun?.id],
    queryFn: () => (activeRun ? api.getExperimentStatus(activeRun.id) : null),
    enabled: !!activeRun,
    refetchInterval: 2000,
  });

  // Completed runs
  const completedRuns = useMemo(() => {
    return experiments?.filter((e) => e.status === "COMPLETED") || [];
  }, [experiments]);

  // Abort active sweep mutation
  const abortMutation = useMutation({
    mutationFn: (runId: string) => api.deleteExperiment(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
    },
  });

  // Auto-select downloaded models as soon as registry loads
  useEffect(() => {
    if (allModels && !hasInitializedModels) {
      const downloadedEmbs = allModels
        .filter((m) => m.type === "embedding" && m.is_downloaded)
        .map((m) => m.name);
      const downloadedLLMs = allModels
        .filter((m) => m.type === "llm" && m.is_downloaded)
        .map((m) => m.name);

      if (downloadedEmbs.length > 0) {
        setSelectedEmbeddings(downloadedEmbs);
      }
      if (downloadedLLMs.length > 0) {
        setSelectedLLMs(downloadedLLMs);
      }
      setHasInitializedModels(true);
    }
  }, [allModels, hasInitializedModels]);

  const modelMap = useMemo(() => {
    const map = new Map<string, any>();
    if (allModels) {
      for (const m of allModels) {
        map.set(m.name, m);
      }
    }
    return map;
  }, [allModels]);

  const selectOnlyDownloadedEmbeddings = () => {
    if (!allModels) return;
    const ready = allModels.filter((m) => m.type === "embedding" && m.is_downloaded).map((m) => m.name);
    if (ready.length > 0) setSelectedEmbeddings(ready);
  };

  const selectOnlyDownloadedLLMs = () => {
    if (!allModels) return;
    const ready = allModels.filter((m) => m.type === "llm" && m.is_downloaded).map((m) => m.name);
    if (ready.length > 0) setSelectedLLMs(ready);
  };

  const totalCombinations =
    selectedStrategies.length *
    selectedEmbeddings.length *
    selectedKVals.length *
    selectedRerankers.length *
    selectedLLMs.length;

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const matrixConfig = {
        chunking_strategies: selectedStrategies,
        embedding_models: selectedEmbeddings,
        embedding_providers: selectedEmbeddings.map((m) => {
          const info = modelMap.get(m);
          if (info) return info.provider;
          return m.includes("bge") || m.includes("minilm")
            ? "fastembed"
            : m.includes("nomic")
            ? "ollama"
            : "openai";
        }),
        retrieval_k: selectedKVals,
        distance_metrics: ["cosine"],
        rerankers: selectedRerankers,
        llm_models: selectedLLMs,
        llm_providers: selectedLLMs.map((m) => {
          const info = modelMap.get(m);
          if (info) return info.provider;
          return m.includes("claude")
            ? "anthropic"
            : m.includes("gemini")
            ? "google"
            : m.includes("llama") || m.includes("gemma") || m.includes("mistral") || m.includes("qwen") || m.includes("phi")
            ? "ollama"
            : "openai";
        }),
        system_prompt: customPrompt.trim() || undefined,
        user_api_keys: userApiKeys,
      };

      return api.triggerMatrix(selectedDatasetId, matrixConfig, matrixName || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      router.push("/experiments");
    },
  });

  const handleLaunchClick = () => {
    const neededDownloads: any[] = [];

    for (const embName of selectedEmbeddings) {
      const m = modelMap.get(embName);
      if (m && ["ollama", "fastembed"].includes(m.provider) && !m.is_downloaded) {
        neededDownloads.push({
          name: m.name,
          provider: m.provider,
          type: "embedding",
          ram_required: m.ram_required,
        });
      }
    }

    for (const llmName of selectedLLMs) {
      const m = modelMap.get(llmName);
      if (m && ["ollama", "fastembed"].includes(m.provider) && !m.is_downloaded) {
        neededDownloads.push({
          name: m.name,
          provider: m.provider,
          type: "llm",
          ram_required: m.ram_required,
        });
      }
    }

    if (totalCombinations === 0) {
      if (selectedKVals.length === 0) alert("Please select or add at least one retrieval depth (k) before launching.");
      else if (selectedStrategies.length === 0) alert("Please select at least one chunking strategy.");
      else if (selectedEmbeddings.length === 0) alert("Please select at least one embedding model.");
      else if (selectedLLMs.length === 0) alert("Please select at least one generation LLM.");
      return;
    }

    if (neededDownloads.length > 0) {
      setModelsToDownload(neededDownloads);
      setIsDownloadModalOpen(true);
    } else {
      triggerMutation.mutate();
    }
  };

  const handleDownloadsComplete = () => {
    setIsDownloadModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["models"] });
    triggerMutation.mutate();
  };

  const toggleArrayItem = <T,>(list: T[], item: T, comparator?: (a: T, b: T) => boolean) => {
    const exists = comparator
      ? list.some((x) => comparator(x, item))
      : list.includes(item);
    if (exists) {
      if (list.length === 1) return list;
      return comparator
        ? list.filter((x) => !comparator(x, item))
        : list.filter((x) => x !== item);
    } else {
      return [...list, item];
    }
  };

  // Dynamic 2D Pareto Matrix computation from real completed runs
  const heatmapData = useMemo(() => {
    if (!completedRuns || completedRuns.length === 0) return null;

    const strategySet = new Set<string>();
    const kSet = new Set<number>();

    completedRuns.forEach((r) => {
      const cfg = r.pipeline_config || {};
      const strat =
        cfg.chunk_strategy ||
        (cfg.chunking_strategy && typeof cfg.chunking_strategy === "object"
          ? `${cfg.chunking_strategy.type} ${cfg.chunking_strategy.chunk_size || ""}`.trim()
          : "Standard");
      const k = cfg.retrieval_k || 5;
      strategySet.add(strat);
      kSet.add(Number(k));
    });

    const strategies = Array.from(strategySet);
    const kValues = Array.from(kSet).sort((a, b) => a - b);

    // Map runs into grid cells
    const cellMap = new Map<string, ExperimentRun>();
    completedRuns.forEach((r) => {
      const cfg = r.pipeline_config || {};
      const strat =
        cfg.chunk_strategy ||
        (cfg.chunking_strategy && typeof cfg.chunking_strategy === "object"
          ? `${cfg.chunking_strategy.type} ${cfg.chunking_strategy.chunk_size || ""}`.trim()
          : "Standard");
      const k = cfg.retrieval_k || 5;
      const key = `${strat}__${k}`;
      const existing = cellMap.get(key);
      if (!existing || (r.avg_faithfulness || 0) > (existing.avg_faithfulness || 0)) {
        cellMap.set(key, r);
      }
    });

    // Compute dynamic Pareto frontier
    const paretoRunIds = new Set<string>();
    completedRuns.forEach((r1) => {
      const f1 = r1.avg_faithfulness ?? 0;
      const l1 = r1.avg_latency_ms ?? 99999;
      let isDominated = false;
      for (const r2 of completedRuns) {
        if (r2.id === r1.id) continue;
        const f2 = r2.avg_faithfulness ?? 0;
        const l2 = r2.avg_latency_ms ?? 99999;
        if (f2 >= f1 && l2 <= l1 && (f2 > f1 || l2 < l1)) {
          isDominated = true;
          break;
        }
      }
      if (!isDominated) {
        paretoRunIds.add(r1.id);
      }
    });

    // Overall winner run
    const winnerRun = [...completedRuns].sort(
      (a, b) => (b.avg_faithfulness ?? 0) - (a.avg_faithfulness ?? 0)
    )[0];

    return {
      strategies,
      kValues,
      cellMap,
      paretoRunIds,
      winnerId: winnerRun?.id,
    };
  }, [completedRuns]);

  // Dynamic Leaderboard top 5 runs
  const leaderboardRuns = useMemo(() => {
    return [...completedRuns]
      .sort((a, b) => (b.avg_faithfulness ?? 0) - (a.avg_faithfulness ?? 0))
      .slice(0, 5);
  }, [completedRuns]);

  // Helper to format configuration pipeline label
  const formatPipelineLabel = (r: ExperimentRun) => {
    const cfg = r.pipeline_config || {};
    const strat =
      cfg.chunk_strategy ||
      (cfg.chunking_strategy?.type ? `${cfg.chunking_strategy.type} ${cfg.chunking_strategy.chunk_size || ""}` : "Recursive");
    const k = cfg.retrieval_k ? `k=${cfg.retrieval_k}` : "k=5";
    const rerank = cfg.reranker ? cfg.reranker.replace(/.*\//, "") : "No Rerank";
    const llm = cfg.llm_model ? cfg.llm_model.replace(/.*\//, "") : "LLM";
    return `${strat} • ${k} • ${rerank} • ${llm}`;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Model Download Pre-Flight Modal */}
      <ModelDownloadModal
        isOpen={isDownloadModalOpen}
        modelsToDownload={modelsToDownload}
        onClose={() => setIsDownloadModalOpen(false)}
        onComplete={handleDownloadsComplete}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Combinatorial Matrix Evaluation</h2>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-xs border border-indigo-500/30">
              SWEEP_ENGINE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Analyze 2D Pareto frontier trade-offs, track active sweep workers, and configure combinatorial parameter grids.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            Combinations:{" "}
            <strong
              className={`font-mono font-bold text-sm ml-1 ${
                totalCombinations === 0 ? "text-rose-400" : "text-indigo-400"
              }`}
            >
              {totalCombinations} Runs
            </strong>
          </div>
          <button
            disabled={!selectedDatasetId || triggerMutation.isPending || totalCombinations === 0}
            onClick={handleLaunchClick}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center space-x-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all cursor-pointer"
          >
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Launching Matrix...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <span>Launch Matrix Evaluation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Section 1: Active Sweep & 2D Pareto Analysis */}
      <div className="space-y-6">
        {/* Dynamic Sweep Banner */}
        {activeRun ? (
          <div className="glass-panel p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider">
                    Combinatorial Sweep Active
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    (ID: {activeRun.id.slice(0, 8)} • Dataset:{" "}
                    {datasets?.find((d) => d.id === activeRun.dataset_id)?.name || "Default Dataset"})
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Status: <span className="font-semibold text-white uppercase">{activeRun.status}</span> • Run Name:{" "}
                  <span className="text-indigo-400 font-mono font-semibold">{activeRun.name || `Sweep ${activeRun.id.slice(0, 8)}`}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  disabled={abortMutation.isPending}
                  onClick={() => abortMutation.mutate(activeRun.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/50 border border-rose-800/40 text-xs font-semibold text-rose-300 flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {abortMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5 fill-rose-300" />
                  )}
                  <span>Cancel Sweep</span>
                </button>
              </div>
            </div>

            {/* Sweep Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500 relative"
                  style={{
                    width: `${Math.max(
                      5,
                      activeStatus?.progress_percentage ??
                        Math.round(((activeRun.completed_cases || 0) / (activeRun.total_test_cases || 1)) * 100)
                    )}%`,
                  }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <div className="flex items-center space-x-3">
                  <span>
                    Cases: {activeStatus?.completed ?? activeRun.completed_cases ?? 0}/
                    {activeStatus?.total ?? activeRun.total_test_cases ?? "—"}
                  </span>
                  <span>•</span>
                  <span>
                    Started: {activeRun.started_at ? new Date(activeRun.started_at).toLocaleTimeString() : "Just now"}
                  </span>
                </div>
                <span className="text-indigo-400 font-semibold">
                  {activeStatus?.progress_percentage ?? Math.round(((activeRun.completed_cases || 0) / (activeRun.total_test_cases || 1)) * 100)}% Complete
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span>
                Worker Engine Nominal • {completedRuns.length} completed evaluation runs in history.
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              Ready to queue combinatorial sweeps
            </span>
          </div>
        )}

        {/* 2D Heatmap Matrix */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Grid className="h-4 w-4 text-indigo-400" />
                <span>2D Pareto Response Matrix: Faithfulness vs. Latency</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluated from real completed sweep runs. Gold highlight denotes the empirical Pareto optimal frontier.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={highlightPareto}
                onChange={(e) => setHighlightPareto(e.target.checked)}
                className="accent-indigo-500 rounded cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <span className="text-amber-400 font-bold">★</span>
                <span>Highlight Pareto Frontier</span>
              </span>
            </label>
          </div>

          {/* Render Dynamic Grid if completed runs exist */}
          {heatmapData && heatmapData.strategies.length > 0 ? (
            <div
              className="grid gap-3 items-center"
              style={{
                gridTemplateColumns: `140px repeat(${heatmapData.kValues.length}, minmax(0, 1fr))`,
              }}
            >
              {/* Axis Header */}
              <div className="h-8 flex items-center justify-end pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Chunk \ Top-K
              </div>
              {heatmapData.kValues.map((k) => (
                <div
                  key={k}
                  className="h-8 flex items-center justify-center text-xs font-mono font-semibold text-slate-300 bg-slate-900 rounded-xl border border-slate-800"
                >
                  k = {k}
                </div>
              ))}

              {/* Rows */}
              {heatmapData.strategies.map((strat) => (
                <div key={strat} className="contents">
                  {/* Row Label */}
                  <div className="h-24 flex flex-col justify-center px-3 text-xs bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="font-semibold text-white truncate">{strat}</span>
                    <span className="text-[10px] text-slate-400 font-mono">Strategy</span>
                  </div>

                  {/* Cells */}
                  {heatmapData.kValues.map((k) => {
                    const key = `${strat}__${k}`;
                    const run = heatmapData.cellMap.get(key);

                    if (!run) {
                      return (
                        <div
                          key={k}
                          className="h-24 p-3 rounded-xl bg-slate-950/40 border border-slate-900 border-dashed flex flex-col justify-center items-center text-slate-600 text-xs font-mono"
                        >
                          <span>Not Tested</span>
                        </div>
                      );
                    }

                    const isPareto = heatmapData.paretoRunIds.has(run.id);
                    const isWinner = heatmapData.winnerId === run.id;
                    const faithfulness = run.avg_faithfulness ?? 0;
                    const latency = run.avg_latency_ms ?? 0;

                    return (
                      <div
                        key={k}
                        onMouseEnter={() =>
                          setHoveredCell({
                            id: run.id,
                            variant: `${strat} + k=${k}`,
                            faithfulness: Number(faithfulness.toFixed(3)),
                            recall: Number((run.avg_context_recall ?? 0).toFixed(3)),
                            latency: `${latency.toFixed(0)}ms`,
                            cost: `$${(run.total_cost_usd ?? 0).toFixed(4)}`,
                            reranker: run.pipeline_config?.reranker ? String(run.pipeline_config.reranker).replace(/.*\//, "") : "None",
                          })
                        }
                        className={`h-24 p-3 rounded-xl flex flex-col justify-between transition-all cursor-pointer ${
                          isWinner
                            ? "bg-emerald-950/60 border-2 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/20"
                            : isPareto && highlightPareto
                            ? "bg-emerald-950/40 border-2 border-emerald-400 shadow-md shadow-emerald-500/10"
                            : faithfulness >= 0.85
                            ? "bg-emerald-950/30 border border-emerald-900/40 hover:border-emerald-700"
                            : faithfulness >= 0.75
                            ? "bg-indigo-950/30 border border-indigo-900/40 hover:border-indigo-700"
                            : "bg-slate-900/40 border border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span
                            className={`font-mono text-lg font-bold ${
                              faithfulness >= 0.85 ? "text-emerald-400" : "text-indigo-300"
                            }`}
                          >
                            {faithfulness.toFixed(3)}
                          </span>
                          {isWinner ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono text-[10px] font-bold shadow-sm">
                              ★ WINNER
                            </span>
                          ) : isPareto ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                              ★ PARETO
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-slate-500">
                              #{run.id.slice(0, 4)}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                          <span>Latency</span>
                          <span className="text-slate-200">{latency.toFixed(0)}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 px-4 rounded-xl border border-slate-900 bg-slate-950/40 text-center space-y-2 text-xs text-slate-400">
              <Grid className="h-8 w-8 mx-auto text-slate-600 mb-1" />
              <div className="text-slate-300 font-medium">No completed matrix sweep evaluations found yet.</div>
              <p className="text-slate-500 max-w-md mx-auto">
                Configure your chunking strategies, retrieval depths, and model parameters below, then click Launch Matrix Evaluation to generate your empirical 2D Pareto response matrix.
              </p>
            </div>
          )}

          {/* Cell Inspection Detail Strip */}
          {hoveredCell && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-white font-semibold">{hoveredCell.variant}</span>
                <span className="text-slate-500">({hoveredCell.reranker})</span>
              </div>
              <div className="flex items-center gap-4 text-slate-300">
                <span>
                  Faithfulness: <strong className="text-emerald-400">{hoveredCell.faithfulness}</strong>
                </span>
                <span>
                  Recall: <strong className="text-slate-200">{hoveredCell.recall}</strong>
                </span>
                <span>
                  Latency: <strong className="text-slate-200">{hoveredCell.latency}</strong>
                </span>
                <span>
                  Cost: <strong className="text-slate-200">{hoveredCell.cost}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Leaderboard Table */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              <span>Leaderboard: Top Sweep Configurations Ranked</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Sorted by Faithfulness Mean</span>
          </div>

          {leaderboardRuns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Rank</th>
                    <th className="py-2.5 px-3 font-semibold">Configuration Pipeline</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Faithfulness</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Context Recall</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Mean Latency</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboardRuns.map((r, idx) => {
                    const isWinner = idx === 0;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isWinner
                            ? "bg-slate-900/40 border-l-4 border-l-indigo-500"
                            : "hover:bg-slate-900/30"
                        }`}
                      >
                        <td className="py-3 px-3 font-bold">
                          {idx === 0 && <span className="text-amber-400">🥇 #1 Gold</span>}
                          {idx === 1 && <span className="text-slate-300">🥈 #2 Silver</span>}
                          {idx === 2 && <span className="text-amber-600">🥉 #3 Bronze</span>}
                          {idx > 2 && <span className="text-slate-400">#{idx + 1}</span>}
                        </td>
                        <td className="py-3 px-3 font-medium text-white">
                          {formatPipelineLabel(r)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-400">
                          {r.avg_faithfulness?.toFixed(3) ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {r.avg_context_recall?.toFixed(3) ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {r.avg_latency_ms ? `${r.avg_latency_ms.toFixed(0)}ms` : "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => router.push("/experiments")}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                          >
                            <span>Inspect Trace</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              No completed runs to rank yet. Run a matrix sweep below to populate the leaderboard.
            </div>
          )}
        </div>
      </div>

      {/* Section Divider */}
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-800"></div>
        <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-indigo-400" />
          Combinatorial Parameter Sweep Builder
        </span>
        <div className="flex-grow border-t border-slate-800"></div>
      </div>

      {/* Section 2: Matrix Builder Cards */}
      <div className="space-y-8">
        {/* Step 1: Target Benchmark Dataset */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Database className="h-4 w-4 text-indigo-400" />
            <span>Step 1: Select Target Benchmark Test Dataset</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Evaluation Test Dataset *
              </label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select a benchmark dataset...</option>
                {datasets?.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.test_cases_count ?? 0} test cases)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Sweep Run Name / Tag (Optional)
              </label>
              <input
                type="text"
                value={matrixName}
                onChange={(e) => setMatrixName(e.target.value)}
                placeholder="e.g. Comprehensive RAG Sweep v1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Document Chunking Strategies */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Layers className="h-4 w-4 text-indigo-400" />
              <span>Step 2: Document Chunking Strategies ({selectedStrategies.length} selected)</span>
            </div>
            <span className="text-[11px] text-slate-400">Select parameter variants to test</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Recursive */}
            {(() => {
              const current = selectedStrategies.find((s) => s.type === "recursive");
              const isSelected = !!current;
              return (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div
                    onClick={() => {
                      if (isSelected && selectedStrategies.length > 1) {
                        setSelectedStrategies(selectedStrategies.filter((s) => s.type !== "recursive"));
                      } else if (!isSelected) {
                        setSelectedStrategies([
                          ...selectedStrategies,
                          { type: "recursive", chunk_size: 500, chunk_overlap: 50 },
                        ]);
                      }
                    }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-white">Recursive Character</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Hierarchy split: paragraphs → sentences
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/60">
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Chunk Size</span>
                          <span className="text-white font-mono">{current.chunk_size || 500} tokens</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="2000"
                          step="50"
                          value={current.chunk_size || 500}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelectedStrategies(
                              selectedStrategies.map((s) =>
                                s.type === "recursive" ? { ...s, chunk_size: val } : s
                              )
                            );
                          }}
                          className="w-full accent-indigo-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Chunk Overlap</span>
                          <span className="text-white font-mono">{current.chunk_overlap || 50} tokens</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="500"
                          step="10"
                          value={current.chunk_overlap || 50}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelectedStrategies(
                              selectedStrategies.map((s) =>
                                s.type === "recursive" ? { ...s, chunk_overlap: val } : s
                              )
                            );
                          }}
                          className="w-full accent-indigo-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Semantic Chunking */}
            {(() => {
              const current = selectedStrategies.find((s) => s.type === "semantic");
              const isSelected = !!current;
              return (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div
                    onClick={() => {
                      if (isSelected && selectedStrategies.length > 1) {
                        setSelectedStrategies(selectedStrategies.filter((s) => s.type !== "semantic"));
                      } else if (!isSelected) {
                        setSelectedStrategies([
                          ...selectedStrategies,
                          { type: "semantic", threshold: 0.75 },
                        ]);
                      }
                    }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-white">Semantic Similarity</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Splits on embedding cosine distance shifts
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/60">
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Similarity Threshold</span>
                          <span className="text-white font-mono">{current.threshold || 0.75}</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="0.95"
                          step="0.05"
                          value={current.threshold || 0.75}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setSelectedStrategies(
                              selectedStrategies.map((s) =>
                                s.type === "semantic" ? { ...s, threshold: val } : s
                              )
                            );
                          }}
                          className="w-full accent-indigo-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Fixed-Size Chunking */}
            {(() => {
              const current = selectedStrategies.find((s) => s.type === "fixed");
              const isSelected = !!current;
              return (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div
                    onClick={() => {
                      if (isSelected && selectedStrategies.length > 1) {
                        setSelectedStrategies(selectedStrategies.filter((s) => s.type !== "fixed"));
                      } else if (!isSelected) {
                        setSelectedStrategies([
                          ...selectedStrategies,
                          { type: "fixed", chunk_size: 256, chunk_overlap: 25 },
                        ]);
                      }
                    }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-white">Fixed-Size Window</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Uniform token count split without boundary
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/60">
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Chunk Size</span>
                          <span className="text-white font-mono">{current.chunk_size || 256} tokens</span>
                        </div>
                        <input
                          type="range"
                          min="64"
                          max="1024"
                          step="32"
                          value={current.chunk_size || 256}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelectedStrategies(
                              selectedStrategies.map((s) =>
                                s.type === "fixed" ? { ...s, chunk_size: val } : s
                              )
                            );
                          }}
                          className="w-full accent-indigo-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Step 3: Dense Embedding Models */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Boxes className="h-4 w-4 text-indigo-400" />
              <span>Step 3: Dense Embedding Models ({selectedEmbeddings.length} selected)</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectOnlyDownloadedEmbeddings}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center space-x-1 cursor-pointer"
              >
                <Download className="h-3 w-3 text-emerald-400" />
                <span>Select Downloaded Only</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: "BAAI/bge-small-en-v1.5", label: "BGE Small (FastEmbed)", provider: "fastembed", dim: "384d" },
              { id: "BAAI/bge-base-en-v1.5", label: "BGE Base (FastEmbed)", provider: "fastembed", dim: "768d" },
              { id: "nomic-embed-text", label: "Nomic Embed (Ollama)", provider: "ollama", dim: "768d" },
              { id: "sentence-transformers/all-MiniLM-L6-v2", label: "all-MiniLM-L6-v2", provider: "fastembed", dim: "384d" },
              { id: "text-embedding-3-small", label: "text-embedding-3-small", provider: "openai", dim: "1536d" },
              { id: "text-embedding-3-large", label: "text-embedding-3-large", provider: "openai", dim: "3072d" },
            ].map((emb) => {
              const isSelected = selectedEmbeddings.includes(emb.id);
              const mInfo = modelMap.get(emb.id);

              return (
                <div
                  key={emb.id}
                  onClick={() =>
                    setSelectedEmbeddings(toggleArrayItem(selectedEmbeddings, emb.id))
                  }
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{emb.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {emb.provider} • {emb.dim}
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <ModelStatusBadge
                      isDownloaded={mInfo?.is_downloaded}
                      provider={emb.provider}
                      ramRequired={mInfo?.ram_required}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 4: Vector Retrieval Top-K & Distance Metric */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <FlaskConical className="h-4 w-4 text-indigo-400" />
            <span>Step 4: Vector Retrieval Depths (k) &amp; Distance Metric</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Retrieval Top-K Depth Variants ({selectedKVals.length} active)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 3, 5, 10, 15, 20].map((k) => {
                  const isSelected = selectedKVals.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setSelectedKVals(toggleArrayItem(selectedKVals, k))
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
                          : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      k = {k}
                    </button>
                  );
                })}

                {/* Custom K Tags */}
                {selectedKVals
                  .filter((k) => ![1, 3, 5, 10, 15, 20].includes(k))
                  .map((k) => (
                    <span
                      key={k}
                      className="px-2.5 py-1 rounded-xl text-xs font-mono font-semibold bg-indigo-600 border border-indigo-600 text-white flex items-center space-x-1"
                    >
                      <span>k = {k}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveK(k)}
                        className="hover:text-rose-200 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}

                {/* Custom K Tag Adder Input */}
                <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Custom k"
                    value={customKInput}
                    onChange={(e) => setCustomKInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomK();
                      }
                    }}
                    className="w-16 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomK}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Vector Distance Metric
              </label>
              <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                Cosine Distance (Recommended &amp; Default)
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Cross-Encoder Rerankers */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Settings2 className="h-4 w-4 text-indigo-400" />
            <span>Step 5: Cross-Encoder Rerankers ({selectedRerankers.length} selected)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: null, label: "None (Raw Retrieval)", desc: "Fastest, no rerank stage" },
              { id: "BAAI/bge-reranker-large", label: "BGE Reranker Large", desc: "Local cross-encoder" },
              { id: "rerank-english-v3.0", label: "Cohere Rerank v3", desc: "SaaS API reranker" },
              { id: "cross-encoder/ms-marco-MiniLM-L-6-v2", label: "ms-marco-MiniLM", desc: "Lightweight local" },
            ].map((rr) => {
              const isSelected = selectedRerankers.includes(rr.id);
              return (
                <div
                  key={rr.label}
                  onClick={() =>
                    setSelectedRerankers(toggleArrayItem(selectedRerankers, rr.id))
                  }
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{rr.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{rr.desc}</div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 6: Generation LLMs & System Prompt */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Cpu className="h-4 w-4 text-indigo-400" />
              <span>Step 6: Generation LLMs ({selectedLLMs.length} selected)</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectOnlyDownloadedLLMs}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center space-x-1 cursor-pointer"
              >
                <Download className="h-3 w-3 text-emerald-400" />
                <span>Select Downloaded Only</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: "llama3.2", label: "Llama 3.2 3B", provider: "ollama" },
              { id: "mistral", label: "Mistral 7B", provider: "ollama" },
              { id: "qwen2.5", label: "Qwen 2.5 7B", provider: "ollama" },
              { id: "phi3", label: "Phi-3 Mini", provider: "ollama" },
              { id: "gemma2", label: "Gemma 2 9B", provider: "ollama" },
              { id: "gpt-4o", label: "GPT-4o (Cloud)", provider: "openai" },
              { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "anthropic" },
              { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "google" },
            ].map((llm) => {
              const isSelected = selectedLLMs.includes(llm.id);
              const mInfo = modelMap.get(llm.id);

              return (
                <div
                  key={llm.id}
                  onClick={() =>
                    setSelectedLLMs(toggleArrayItem(selectedLLMs, llm.id))
                  }
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{llm.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {llm.provider}
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <ModelStatusBadge
                      isDownloaded={mInfo?.is_downloaded}
                      provider={llm.provider}
                      ramRequired={mInfo?.ram_required}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* System Prompt Customizer Accordion */}
          <div className="border-t border-slate-800/80 pt-4 mt-2">
            <button
              type="button"
              onClick={() => setShowPromptAccordion(!showPromptAccordion)}
              className="flex items-center justify-between w-full text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <FileCode className="h-4 w-4 text-indigo-400" />
                <span>Custom System Prompt &amp; Grounding Guardrails</span>
                {customPrompt.trim() && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-[10px]">
                    Customized
                  </span>
                )}
              </div>
              {showPromptAccordion ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>

            {showPromptAccordion && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-slate-400">
                  Override default system instruction passed to all generated combinations. Leave blank to use default.
                </p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={DEFAULT_SYSTEM_PROMPT}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
                {customPrompt && (
                  <button
                    type="button"
                    onClick={() => setCustomPrompt("")}
                    className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset to Default Prompt</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Floating Action Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky bottom-4 shadow-2xl z-20">
          <div className="flex items-center space-x-3">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <div>
              <div className="text-sm font-semibold text-white">Combinatorial Sweep Space</div>
              <div className="text-xs text-slate-400">
                {selectedStrategies.length} chunkings × {selectedEmbeddings.length} embs ×{" "}
                {selectedKVals.length} depths × {selectedRerankers.length} reranks ×{" "}
                {selectedLLMs.length} models ={" "}
                <strong
                  className={`font-mono font-bold ${
                    totalCombinations === 0 ? "text-rose-400" : "text-indigo-400"
                  }`}
                >
                  {totalCombinations} Total Runs
                </strong>
              </div>
            </div>
          </div>

          <button
            disabled={!selectedDatasetId || triggerMutation.isPending || totalCombinations === 0}
            onClick={handleLaunchClick}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center space-x-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all cursor-pointer"
          >
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Launching Matrix...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <span>Launch Matrix Evaluation ({totalCombinations})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
