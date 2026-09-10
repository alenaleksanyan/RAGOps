"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowRight,
  BarChart2,
  Bot,
  Boxes,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  FlaskConical,
  GitCompare,
  Layers,
  Play,
  Sparkles,
  Zap,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const {
    data: documents,
    isLoading: loadingDocs,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: api.getDocuments,
    staleTime: 0,
  });

  const {
    data: datasets,
    isLoading: loadingDatasets,
    refetch: refetchDatasets,
  } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.getDatasets,
    staleTime: 0,
  });

  const {
    data: experiments,
    isLoading: loadingExperiments,
    refetch: refetchExperiments,
  } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.getExperiments(),
    staleTime: 0,
  });

  useEffect(() => {
    refetchDocs();
    refetchDatasets();
    refetchExperiments();
  }, [refetchDocs, refetchDatasets, refetchExperiments]);

  const isLoading = loadingDocs || loadingDatasets || loadingExperiments;

  const totalDocs = documents?.length ?? 0;
  const totalDatasets = datasets?.length ?? 0;
  const totalRuns = experiments?.length ?? 0;
  const validRuns =
    experiments?.filter(
      (r) =>
        r.status === "COMPLETED" ||
        r.avg_context_precision !== null ||
        r.avg_context_recall !== null
    ) || [];

  const precisionRuns = validRuns.filter(
    (r) => r.avg_context_precision !== null && r.avg_context_precision !== undefined
  );
  const avgPrecision =
    precisionRuns.length > 0
      ? (
          precisionRuns.reduce((acc, r) => acc + (r.avg_context_precision || 0), 0) /
          precisionRuns.length
        ).toFixed(2)
      : "—";

  const recallRuns = validRuns.filter(
    (r) => r.avg_context_recall !== null && r.avg_context_recall !== undefined
  );
  const avgRecall =
    recallRuns.length > 0
      ? (
          recallRuns.reduce((acc, r) => acc + (r.avg_context_recall || 0), 0) /
          recallRuns.length
        ).toFixed(2)
      : "—";

  const latencyRuns = validRuns.filter(
    (r) => r.avg_latency_ms !== null && r.avg_latency_ms !== undefined
  );
  const avgLatency =
    latencyRuns.length > 0
      ? (
          latencyRuns.reduce((acc, r) => acc + (r.avg_latency_ms || 0), 0) /
          latencyRuns.length
        ).toFixed(0)
      : "—";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl glass-panel p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute -right-12 -bottom-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-semibold mb-4">
            <Zap className="h-3.5 w-3.5" />
            <span>Asynchronous LLMOps Workbench</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-3">
            Eliminate Guesswork from <span className="gradient-text">RAG Engineering</span>
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            Run automated evaluation matrixes across chunking strategies, vector models, retrieval $k$,
            and rerankers. Measure context precision, context recall, faithfulness, latency, and cost.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/playground"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              <Bot className="h-4 w-4" />
              <span>Interactive RAG Playground</span>
            </Link>
            <Link
              href="/matrix"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-sm font-medium border border-slate-700/60 transition-all"
            >
              <Layers className="h-4 w-4 text-indigo-400" />
              <span>Build Experiment Matrix</span>
            </Link>
            <Link
              href="/benchmarks"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-sm font-medium border border-slate-700/60 transition-all"
            >
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span>Generate Synthetic QA</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ingested Documents
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {isLoading ? (
              <span className="inline-block w-8 h-8 rounded bg-slate-800 animate-pulse align-middle" />
            ) : (
              totalDocs
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Ready for chunking & indexing</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Test Datasets
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {isLoading ? (
              <span className="inline-block w-8 h-8 rounded bg-slate-800 animate-pulse align-middle" />
            ) : (
              totalDatasets
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Ground-truth QA benchmarks</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Avg Context Precision
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {isLoading ? (
              <span className="inline-block w-12 h-8 rounded bg-slate-800 animate-pulse align-middle" />
            ) : (
              avgPrecision
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Avg Recall:{" "}
            <strong className="text-slate-300">
              {isLoading ? "..." : avgRecall}
            </strong>
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Matrix Runs
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <FlaskConical className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {isLoading ? (
              <span className="inline-block w-8 h-8 rounded bg-slate-800 animate-pulse align-middle" />
            ) : (
              totalRuns
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Avg Latency:{" "}
            <strong className="text-slate-300">
              {isLoading ? "..." : `${avgLatency} ms`}
            </strong>
          </p>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/documents"
          className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between group"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1.5">Documents & Chunks</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload PDF, Markdown, DOCX, and TXT files. Preview recursive, semantic, parent-document, and token chunk boundaries.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
            <span>Manage documents</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </div>
        </Link>

        <Link
          href="/matrix"
          className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between group"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1.5">Matrix Builder</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Define combinatorial experimentation matrixes: test multiple chunk sizes, embedding models, and rerankers side-by-side.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
            <span>Launch experiment matrix</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </div>
        </Link>

        <Link
          href="/compare"
          className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between group"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <GitCompare className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1.5">Side-by-Side Diff Viewer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Compare two pipeline runs on identical questions with answer diffs, chunk rank attributions, and precision differentials.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-semibold text-pink-400 group-hover:translate-x-1 transition-transform">
            <span>Compare runs</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </div>
        </Link>
      </div>

      {/* Recent Experiment Runs */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-white">Recent Experiment Runs</h3>
            <p className="text-xs text-slate-400">Latest RAG evaluation batch executions</p>
          </div>
          <Link
            href="/experiments"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center"
          >
            <span>View all runs</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </div>

        {experiments && experiments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Run Name / Config</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Precision</th>
                  <th className="pb-3 font-semibold">Recall</th>
                  <th className="pb-3 font-semibold">Faithfulness</th>
                  <th className="pb-3 font-semibold">Latency</th>
                  <th className="pb-3 font-semibold">Cost (USD)</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {experiments.slice(0, 5).map((run) => (
                  <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 font-medium text-slate-200">
                      <div className="font-semibold text-white">{run.name || `Run ${run.id.slice(0, 8)}`}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {run.pipeline_config?.chunk_strategy} • {run.pipeline_config?.embedding_model} • k={run.pipeline_config?.retrieval_k}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
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
                    </td>
                    <td className="py-3.5 text-slate-300 font-mono">
                      {run.avg_context_precision ? run.avg_context_precision.toFixed(2) : "—"}
                    </td>
                    <td className="py-3.5 text-slate-300 font-mono">
                      {run.avg_context_recall ? run.avg_context_recall.toFixed(2) : "—"}
                    </td>
                    <td className="py-3.5 text-slate-300 font-mono">
                      {run.avg_faithfulness ? run.avg_faithfulness.toFixed(2) : "—"}
                    </td>
                    <td className="py-3.5 text-slate-300 font-mono">
                      {run.avg_latency_ms ? `${run.avg_latency_ms.toFixed(0)} ms` : "—"}
                    </td>
                    <td className="py-3.5 text-slate-300 font-mono">
                      {run.total_cost_usd !== undefined && run.total_cost_usd !== null
                        ? `$${run.total_cost_usd.toFixed(4)}`
                        : "—"}
                    </td>
                    <td className="py-3.5 text-right">
                      <Link
                        href={`/experiments?runId=${run.id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            No experiment runs yet. Upload a document and launch your first matrix run.
          </div>
        )}
      </div>
    </div>
  );
}
