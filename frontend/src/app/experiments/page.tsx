"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { EvaluationResult, ExperimentRun } from "@/types";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Cpu,
  Download,
  Eye,
  FileText,
  FlaskConical,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";

function ExperimentsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialRunId = searchParams.get("runId");

  const [activeRun, setActiveRun] = useState<ExperimentRun | null>(null);
  const [expandedPassages, setExpandedPassages] = useState<Record<string, boolean>>({});
  const [selectedChunkInfo, setSelectedChunkInfo] = useState<any | null>(null);
  const [copiedChunkText, setCopiedChunkText] = useState(false);

  const [selectedTextModal, setSelectedTextModal] = useState<{
    title: string;
    badge?: string;
    badgeColor?: string;
    content: string;
  } | null>(null);
  const [copiedModalText, setCopiedModalText] = useState(false);

  const handleExportRunReport = (run: ExperimentRun, results: EvaluationResult[]) => {
    const report = {
      run_id: run.id,
      run_name: run.name || `Run ${run.id.slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      pipeline_config: run.pipeline_config,
      aggregate_metrics: {
        context_precision: run.avg_context_precision,
        context_recall: run.avg_context_recall,
        faithfulness: run.avg_faithfulness,
        answer_relevance: run.avg_answer_relevance,
        average_latency_ms: run.avg_latency_ms,
        total_cost_usd: run.total_cost_usd,
      },
      evaluation_results: results.map((r, idx) => ({
        index: idx + 1,
        question: r.question,
        ground_truth: r.ground_truth_answer,
        generated_answer: r.generated_answer,
        metrics: {
          context_precision: r.context_precision,
          context_recall: r.context_recall,
          faithfulness: r.faithfulness,
          answer_relevance: r.answer_relevance,
          latency_ms: r.latency_ms,
          cost_usd: r.estimated_cost_usd,
        },
        retrieved_passages: r.retrieved_chunks_json || [],
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ragbench_report_${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePassages = (id: string) => {
    setExpandedPassages((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyChunk = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkText(true);
    setTimeout(() => setCopiedChunkText(false), 2000);
  };

  const handleCopyModalText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedModalText(true);
    setTimeout(() => setCopiedModalText(false), 2000);
  };

  const { data: experiments, isLoading, refetch } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.getExperiments(),
    refetchInterval: (query) => {
      // Auto-poll every 3s if any run is in RUNNING or PENDING status
      const data = query.state.data;
      const hasRunning = data?.some((r) => r.status === "RUNNING" || r.status === "PENDING");
      return hasRunning ? 3000 : false;
    },
  });

  const { data: runResults, isLoading: loadingResults } = useQuery({
    queryKey: ["experiment-results", activeRun?.id],
    queryFn: () => (activeRun ? api.getExperimentResults(activeRun.id) : []),
    enabled: !!activeRun,
  });

  useEffect(() => {
    if (initialRunId && experiments) {
      const match = experiments.find((r) => r.id === initialRunId);
      if (match) setActiveRun(match);
    }
  }, [initialRunId, experiments]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteExperiment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      if (activeRun) setActiveRun(null);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => api.deleteAllExperiments(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      setActiveRun(null);
    },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Experiment Runs & Evaluation Telemetry</h2>
          <p className="text-xs text-slate-400 mt-1">
            Track real-time background evaluation progress, token costs, latency breakdowns, and Ragas metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {experiments && experiments.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to delete all experiment runs?")) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending}
              className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 hover:text-rose-200 text-xs font-medium inline-flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{deleteAllMutation.isPending ? "Clearing..." : "Clear All Runs"}</span>
            </button>
          )}

          <button
            onClick={() => refetch()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium inline-flex items-center space-x-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Experiments Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 space-x-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <span className="text-xs">Loading experiment runs...</span>
          </div>
        ) : experiments && experiments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Run Details / Configuration</th>
                  <th className="pb-3 font-semibold">Status / Progress</th>
                  <th className="pb-3 font-semibold">Precision</th>
                  <th className="pb-3 font-semibold">Recall</th>
                  <th className="pb-3 font-semibold">Faithfulness</th>
                  <th className="pb-3 font-semibold">Relevance</th>
                  <th className="pb-3 font-semibold">Avg Latency</th>
                  <th className="pb-3 font-semibold">Cost (USD)</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {experiments.map((run) => {
                  const progressPct =
                    run.total_test_cases && run.total_test_cases > 0
                      ? Math.round(((run.completed_cases || 0) / run.total_test_cases) * 100)
                      : 0;

                  return (
                    <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 font-medium text-slate-200">
                        <div className="font-semibold text-white">{run.name || `Run ${run.id.slice(0, 8)}`}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {run.pipeline_config?.chunk_strategy} • {run.pipeline_config?.embedding_model} • k={run.pipeline_config?.retrieval_k} • {run.pipeline_config?.llm_model}
                        </div>
                      </td>
                      <td className="py-3.5">
                        <div className="space-y-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              run.status === "COMPLETED"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : run.status === "RUNNING"
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse"
                                : run.status === "FAILED"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : "bg-slate-700/40 text-slate-400"
                            }`}
                          >
                            {run.status}
                          </span>
                          {run.status === "RUNNING" && (
                            <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.avg_context_precision !== undefined && run.avg_context_precision !== null
                          ? run.avg_context_precision.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.avg_context_recall !== undefined && run.avg_context_recall !== null
                          ? run.avg_context_recall.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.avg_faithfulness !== undefined && run.avg_faithfulness !== null
                          ? run.avg_faithfulness.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.avg_answer_relevance !== undefined && run.avg_answer_relevance !== null
                          ? run.avg_answer_relevance.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.avg_latency_ms ? `${run.avg_latency_ms.toFixed(0)} ms` : "—"}
                      </td>
                      <td className="py-3.5 text-slate-300 font-mono">
                        {run.total_cost_usd !== undefined && run.total_cost_usd !== null
                          ? `$${run.total_cost_usd.toFixed(4)}`
                          : "—"}
                      </td>
                      <td className="py-3.5 text-right space-x-2">
                        <button
                          onClick={() => setActiveRun(run)}
                          className="p-1.5 rounded-lg bg-slate-800 text-indigo-400 hover:text-indigo-300 hover:bg-slate-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(run.id)}
                          className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-xs">
            No experiment runs found. Launch a run from the Matrix Builder to view results here.
          </div>
        )}
      </div>

      {/* Experiment Results Detail Modal */}
      {activeRun && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-indigo-400" />
                  <span>{activeRun.name || `Run ${activeRun.id.slice(0, 8)}`}</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {activeRun.pipeline_config?.chunk_strategy} • {activeRun.pipeline_config?.embedding_model} • k={activeRun.pipeline_config?.retrieval_k}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runResults && handleExportRunReport(activeRun, runResults)}
                  disabled={!runResults || runResults.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
                  title="Export complete run results as JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Report</span>
                </button>
                <button
                  onClick={() => setActiveRun(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {loadingResults ? (
                <div className="flex items-center justify-center py-12 text-slate-400 space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  <span className="text-xs">Loading evaluation results...</span>
                </div>
              ) : runResults && runResults.length > 0 ? (
                runResults.map((res, i) => (
                  <div
                    key={res.id}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-400 font-mono">
                        Test Case #{i + 1}
                      </span>
                      <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-300">
                        <span>Precision: <strong className="text-emerald-400">{res.context_precision?.toFixed(2) || "—"}</strong></span>
                        <span>Recall: <strong className="text-emerald-400">{res.context_recall?.toFixed(2) || "—"}</strong></span>
                        <span>Faithfulness: <strong className="text-purple-400">{res.faithfulness?.toFixed(2) || "—"}</strong></span>
                        <span>Latency: <strong className="text-slate-200">{res.latency_ms?.toFixed(0) || "—"} ms</strong></span>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      {res.question && (
                        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                              <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
                              <span>Query / Question:</span>
                            </span>
                            {res.question_type && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-900/60 text-indigo-300 font-mono text-[10px] uppercase tracking-wider">
                                {res.question_type}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white font-medium font-sans leading-relaxed">
                            {res.question}
                          </p>
                        </div>
                      )}

                      <div className={`grid grid-cols-1 ${res.ground_truth_answer ? "md:grid-cols-2" : ""} gap-3`}>
                        <div
                          onClick={() =>
                            res.generated_answer &&
                            setSelectedTextModal({
                              title: `Generated Response (Test Case #${i + 1})`,
                              badge: "LLM Output",
                              badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
                              content: res.generated_answer,
                            })
                          }
                          className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900/60 transition-all cursor-pointer group space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-semibold">Generated Response:</span>
                            <span className="text-[10px] text-slate-500 group-hover:text-indigo-400 font-mono flex items-center gap-1 transition-colors">
                              <Maximize2 className="h-3 w-3" /> Full View
                            </span>
                          </div>
                          <div className="line-clamp-3 select-text text-slate-200 text-xs">
                            <MarkdownRenderer content={res.generated_answer || "No answer generated"} />
                          </div>
                        </div>

                        {res.ground_truth_answer && (
                          <div
                            onClick={() =>
                              res.ground_truth_answer &&
                              setSelectedTextModal({
                                title: `Ground-Truth Reference (Test Case #${i + 1})`,
                                badge: "Benchmark Target",
                                badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                                content: res.ground_truth_answer,
                              })
                            }
                            className="bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-800/40 hover:border-emerald-500/60 hover:bg-emerald-950/30 transition-all cursor-pointer group space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-emerald-400 font-semibold">Ground-Truth Reference:</span>
                              <span className="text-[10px] text-emerald-500/70 group-hover:text-emerald-300 font-mono flex items-center gap-1 transition-colors">
                                <Maximize2 className="h-3 w-3" /> Full View
                              </span>
                            </div>
                            <div className="line-clamp-3 select-text text-slate-200 text-xs">
                              <MarkdownRenderer content={res.ground_truth_answer} />
                            </div>
                          </div>
                        )}
                      </div>

                      {res.retrieved_chunks_json && res.retrieved_chunks_json.length > 0 && (
                        <div className="space-y-2 pt-1 border-t border-slate-800/60">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => togglePassages(res.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              {expandedPassages[res.id] ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              <span>
                                Retrieved Context Passages ({res.retrieved_chunks_json.length})
                              </span>
                            </button>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Click to {expandedPassages[res.id] ? "collapse" : "expand"}
                            </span>
                          </div>

                          {expandedPassages[res.id] && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                              {res.retrieved_chunks_json.map((chunk: any, cIdx: number) => (
                                <div
                                  key={cIdx}
                                  onClick={() => setSelectedChunkInfo(chunk)}
                                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 hover:border-indigo-500/50 hover:bg-slate-900/60 transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[11px] text-indigo-400 font-mono font-semibold">
                                        Rank #{chunk.rank} • Score: {chunk.score.toFixed(3)}
                                      </span>
                                      <span className="text-[10px] text-slate-500 group-hover:text-indigo-300 font-mono flex items-center gap-1 transition-colors">
                                        <Maximize2 className="h-3 w-3" /> Full Info
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3 font-mono">
                                      {chunk.content}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No evaluation results available for this run.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Chunk Info Modal */}
      {selectedChunkInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-mono font-bold text-xs">
                  #{selectedChunkInfo.rank}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Retrieved Chunk Full Details</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Similarity Score: <span className="text-emerald-400 font-bold">{(selectedChunkInfo.score * 100).toFixed(1)}%</span> ({selectedChunkInfo.score.toFixed(4)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedChunkInfo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Full Passage Content
                </label>
                <div className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap select-text max-h-72 overflow-y-auto">
                  {selectedChunkInfo.parent_content || selectedChunkInfo.content}
                </div>
              </div>

              {selectedChunkInfo.parent_content && (
                <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-800/40 text-[11px] text-purple-300 flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-purple-400" />
                  <span>Enclosed in resolved Parent-Document chunk hierarchy</span>
                </div>
              )}

              {selectedChunkInfo.chunk_id && (
                <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
                  <span>Chunk ID: {selectedChunkInfo.chunk_id}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => handleCopyChunk(selectedChunkInfo.parent_content || selectedChunkInfo.content)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedChunkText ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied Content!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Chunk Text</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setSelectedChunkInfo(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Text View Modal (Generated Response / Ground Truth) */}
      {selectedTextModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center space-x-3">
                {selectedTextModal.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      selectedTextModal.badgeColor || "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                    }`}
                  >
                    {selectedTextModal.badge}
                  </span>
                )}
                <h3 className="text-sm font-semibold text-white">{selectedTextModal.title}</h3>
              </div>
              <button
                onClick={() => setSelectedTextModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 select-text max-h-[60vh] overflow-y-auto">
                <MarkdownRenderer content={selectedTextModal.content} />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => handleCopyModalText(selectedTextModal.content)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedModalText ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setSelectedTextModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExperimentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
          <span>Loading experiments workbench...</span>
        </div>
      }
    >
      <ExperimentsContent />
    </Suspense>
  );
}
