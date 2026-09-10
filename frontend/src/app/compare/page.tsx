"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowRight,
  CheckCircle2,
  GitCompare,
  Layers,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Plus,
  X,
  Radar,
  Zap,
  Check,
  Search,
  ChevronRight,
  ChevronLeft,
  Gavel,
  ShieldCheck,
  HelpCircle,
  Clock,
  Coins,
  FileText,
  Sliders,
  Info,
} from "lucide-react";
import { EvaluationResult, ExperimentRun, FailureAnalysisItem, TestCaseComparison } from "@/types";

interface PipelineConfig {
  letter: string;
  runId: string;
  name: string;
  color: string;
  bgBadge: string;
  borderBadge: string;
  textBadge: string;
  dotColor: string;
}

const PIPELINE_PALETTE = [
  {
    letter: "A",
    color: "#6366F1",
    bgBadge: "bg-indigo-500/10",
    borderBadge: "border-indigo-500/30",
    textBadge: "text-indigo-400",
    dotColor: "bg-indigo-500",
  },
  {
    letter: "B",
    color: "#06B6D4",
    bgBadge: "bg-cyan-500/10",
    borderBadge: "border-cyan-500/30",
    textBadge: "text-cyan-400",
    dotColor: "bg-cyan-500",
  },
  {
    letter: "C",
    color: "#10B981",
    bgBadge: "bg-emerald-500/10",
    borderBadge: "border-emerald-500/30",
    textBadge: "text-emerald-400",
    dotColor: "bg-emerald-500",
  },
  {
    letter: "D",
    color: "#F59E0B",
    bgBadge: "bg-amber-500/10",
    borderBadge: "border-amber-500/30",
    textBadge: "text-amber-400",
    dotColor: "bg-amber-500",
  },
];

export default function CompareRunsPage() {
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>(["", ""]);
  const [showDisagreementsOnly, setShowDisagreementsOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [addDropdownOpen, setAddDropdownOpen] = useState<boolean>(false);

  const runAId = selectedRunIds[0] || "";
  const runBId = selectedRunIds[1] || "";
  const runCId = selectedRunIds[2] || "";
  const runDId = selectedRunIds[3] || "";

  // Fetch all experiments
  const { data: experiments, isLoading: isExperimentsLoading } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.getExperiments(),
  });

  // Base pairwise comparison (Run A vs Run B)
  const { data: comparisonAB, isLoading: isCompLoading } = useQuery({
    queryKey: ["compare-runs", runAId, runBId],
    queryFn: () => (runAId && runBId ? api.compareRuns(runAId, runBId) : null),
    enabled: !!runAId && !!runBId && runAId !== runBId,
  });

  // Optional Run C results
  const { data: resultsC } = useQuery({
    queryKey: ["experiment-results", runCId],
    queryFn: () => (runCId ? api.getExperimentResults(runCId) : null),
    enabled: !!runCId,
  });

  // Optional Run D results
  const { data: resultsD } = useQuery({
    queryKey: ["experiment-results", runDId],
    queryFn: () => (runDId ? api.getExperimentResults(runDId) : null),
    enabled: !!runDId,
  });

  // Real Failure Analysis for Candidate Run B
  const { data: candidateFailures, isLoading: isFailuresLoading } = useQuery({
    queryKey: ["failures", runBId],
    queryFn: () => (runBId ? api.getFailures(runBId) : null),
    enabled: !!runBId,
  });

  // Helper to get Experiment Run metadata
  const getRunMeta = (id: string): ExperimentRun | undefined => {
    return experiments?.find((e) => e.id === id);
  };

  // Pipeline descriptors
  const activePipelines: PipelineConfig[] = useMemo(() => {
    return selectedRunIds
      .map((id, idx) => {
        if (!id) return null;
        const meta = getRunMeta(id);
        const palette = PIPELINE_PALETTE[idx % PIPELINE_PALETTE.length];
        return {
          letter: palette.letter,
          runId: id,
          name: meta?.name || `Run ${id.slice(0, 8)}`,
          color: palette.color,
          bgBadge: palette.bgBadge,
          borderBadge: palette.borderBadge,
          textBadge: palette.textBadge,
          dotColor: palette.dotColor,
        };
      })
      .filter(Boolean) as PipelineConfig[];
  }, [selectedRunIds, experiments]);

  // Aggregate Metrics per active pipeline (Fully Dynamic with no fake fallbacks)
  const pipelineMetrics = useMemo(() => {
    return activePipelines.map((p) => {
      const meta = getRunMeta(p.runId);

      let faith = meta?.avg_faithfulness ?? 0;
      let rel = meta?.avg_answer_relevance ?? 0;
      let prec = meta?.avg_context_precision ?? 0;
      let rec = meta?.avg_context_recall ?? 0;
      let lat = meta?.avg_latency_ms ?? 0;
      let cost = meta?.total_cost_usd ?? 0;

      if (comparisonAB) {
        if (p.runId === runAId) {
          faith = comparisonAB.metrics_a.faithfulness;
          rel = comparisonAB.metrics_a.answer_relevance;
          prec = comparisonAB.metrics_a.context_precision;
          rec = comparisonAB.metrics_a.context_recall;
          lat = comparisonAB.metrics_a.avg_latency_ms;
          cost = comparisonAB.metrics_a.total_cost_usd;
        } else if (p.runId === runBId) {
          faith = comparisonAB.metrics_b.faithfulness;
          rel = comparisonAB.metrics_b.answer_relevance;
          prec = comparisonAB.metrics_b.context_precision;
          rec = comparisonAB.metrics_b.context_recall;
          lat = comparisonAB.metrics_b.avg_latency_ms;
          cost = comparisonAB.metrics_b.total_cost_usd;
        }
      } else if (p.runId === runCId && resultsC && resultsC.length > 0) {
        const count = resultsC.length;
        faith = resultsC.reduce((acc, r) => acc + (r.faithfulness || 0), 0) / count;
        rel = resultsC.reduce((acc, r) => acc + (r.answer_relevance || 0), 0) / count;
        prec = resultsC.reduce((acc, r) => acc + (r.context_precision || 0), 0) / count;
        rec = resultsC.reduce((acc, r) => acc + (r.context_recall || 0), 0) / count;
        lat = resultsC.reduce((acc, r) => acc + (r.latency_ms || 0), 0) / count;
        cost = resultsC.reduce((acc, r) => acc + (r.estimated_cost_usd || 0), 0);
      } else if (p.runId === runDId && resultsD && resultsD.length > 0) {
        const count = resultsD.length;
        faith = resultsD.reduce((acc, r) => acc + (r.faithfulness || 0), 0) / count;
        rel = resultsD.reduce((acc, r) => acc + (r.answer_relevance || 0), 0) / count;
        prec = resultsD.reduce((acc, r) => acc + (r.context_precision || 0), 0) / count;
        rec = resultsD.reduce((acc, r) => acc + (r.context_recall || 0), 0) / count;
        lat = resultsD.reduce((acc, r) => acc + (r.latency_ms || 0), 0) / count;
        cost = resultsD.reduce((acc, r) => acc + (r.estimated_cost_usd || 0), 0);
      }

      return {
        ...p,
        faithfulness: faith,
        relevance: rel,
        precision: prec,
        recall: rec,
        latency: lat,
        cost: cost,
      };
    });
  }, [activePipelines, comparisonAB, runAId, runBId, runCId, runDId, resultsC, resultsD]);

  // Handler to add a new pipeline
  const handleAddPipeline = (runId: string) => {
    if (selectedRunIds.length >= 4 || selectedRunIds.includes(runId)) return;
    const emptyIdx = selectedRunIds.findIndex((id) => !id);
    if (emptyIdx !== -1) {
      const next = [...selectedRunIds];
      next[emptyIdx] = runId;
      setSelectedRunIds(next);
    } else {
      setSelectedRunIds([...selectedRunIds, runId]);
    }
    setAddDropdownOpen(false);
  };

  // Handler to remove a pipeline
  const handleRemovePipeline = (idx: number) => {
    if (selectedRunIds.length <= 2) {
      const next = [...selectedRunIds];
      next[idx] = "";
      setSelectedRunIds(next);
    } else {
      const next = selectedRunIds.filter((_, i) => i !== idx);
      setSelectedRunIds(next);
    }
  };

  // Map results for Run C & Run D by test_case_id
  const resultsCMap = useMemo(() => {
    const map = new Map<string, EvaluationResult>();
    resultsC?.forEach((r) => map.set(r.test_case_id, r));
    return map;
  }, [resultsC]);

  const resultsDMap = useMemo(() => {
    const map = new Map<string, EvaluationResult>();
    resultsD?.forEach((r) => map.set(r.test_case_id, r));
    return map;
  }, [resultsD]);

  // Merge Test Case Comparisons
  const testCasesData = useMemo(() => {
    if (!comparisonAB?.test_case_comparisons) return [];
    return comparisonAB.test_case_comparisons.map((tc) => {
      const itemC = resultsCMap.get(tc.test_case_id);
      const itemD = resultsDMap.get(tc.test_case_id);

      // Check if test case is a disagreement
      const precDiff = Math.abs((tc.run_a_precision || 0) - (tc.run_b_precision || 0));
      const faithDiff = Math.abs((tc.run_a_faithfulness || 0) - (tc.run_b_faithfulness || 0));
      const isDisagreement =
        precDiff > 0.15 ||
        faithDiff > 0.15 ||
        ((tc.run_a_precision || 0) >= 0.7 && (tc.run_b_precision || 0) < 0.7) ||
        ((tc.run_b_precision || 0) >= 0.7 && (tc.run_a_precision || 0) < 0.7);

      return {
        ...tc,
        run_c_answer: itemC?.generated_answer ?? null,
        run_c_precision: itemC?.context_precision ?? null,
        run_c_faithfulness: itemC?.faithfulness ?? null,
        run_c_latency_ms: itemC?.latency_ms ?? null,
        run_c_chunks: itemC?.retrieved_chunks_json ?? null,

        run_d_answer: itemD?.generated_answer ?? null,
        run_d_precision: itemD?.context_precision ?? null,
        run_d_faithfulness: itemD?.faithfulness ?? null,
        run_d_latency_ms: itemD?.latency_ms ?? null,
        run_d_chunks: itemD?.retrieved_chunks_json ?? null,

        isDisagreement,
      };
    });
  }, [comparisonAB, resultsCMap, resultsDMap]);

  // Filtered test cases
  const filteredTestCases = useMemo(() => {
    return testCasesData.filter((tc) => {
      if (showDisagreementsOnly && !tc.isDisagreement) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQ = tc.question.toLowerCase().includes(q);
        const matchesAns =
          (tc.run_a_answer?.toLowerCase().includes(q) ?? false) ||
          (tc.run_b_answer?.toLowerCase().includes(q) ?? false) ||
          (tc.ground_truth_answer?.toLowerCase().includes(q) ?? false);
        return matchesQ || matchesAns;
      }
      return true;
    });
  }, [testCasesData, showDisagreementsOnly, searchQuery]);

  const totalDisagreementsCount = useMemo(() => {
    return testCasesData.filter((tc) => tc.isDisagreement).length;
  }, [testCasesData]);

  // Dynamic Champion & Runner-up Calculation
  const { championPipeline, runnerUpPipeline, metricsWonCount } = useMemo(() => {
    if (pipelineMetrics.length === 0) {
      return { championPipeline: null, runnerUpPipeline: null, metricsWonCount: 0 };
    }
    const ranked = [...pipelineMetrics].sort((a, b) => {
      const scoreA = a.faithfulness * 0.35 + a.relevance * 0.25 + a.precision * 0.2 + a.recall * 0.2;
      const scoreB = b.faithfulness * 0.35 + b.relevance * 0.25 + b.precision * 0.2 + b.recall * 0.2;
      return scoreB - scoreA;
    });

    const champ = ranked[0];
    const runnerUp = ranked[1] || champ;

    // Count dimensions won by champion
    let won = 0;
    if (champ.faithfulness > runnerUp.faithfulness) won++;
    if (champ.relevance > runnerUp.relevance) won++;
    if (champ.precision > runnerUp.precision) won++;
    if (champ.recall > runnerUp.recall) won++;
    if (champ.latency < runnerUp.latency && champ.latency > 0) won++;
    if (champ.cost <= runnerUp.cost) won++;

    return { championPipeline: champ, runnerUpPipeline: runnerUp, metricsWonCount: won };
  }, [pipelineMetrics]);

  // Real Jaccard Chunk Overlap computation across available chunks
  const overlapStats = useMemo(() => {
    if (!comparisonAB?.test_case_comparisons || comparisonAB.test_case_comparisons.length === 0) {
      return null;
    }
    const allAChunks = new Set<string>();
    const allBChunks = new Set<string>();

    comparisonAB.test_case_comparisons.forEach((tc) => {
      tc.run_a_chunks?.forEach((c: any) => {
        if (c?.chunk_id) allAChunks.add(String(c.chunk_id));
        else if (typeof c === "string") allAChunks.add(c);
      });
      tc.run_b_chunks?.forEach((c: any) => {
        if (c?.chunk_id) allBChunks.add(String(c.chunk_id));
        else if (typeof c === "string") allBChunks.add(c);
      });
    });

    if (allAChunks.size === 0 && allBChunks.size === 0) {
      return null;
    }

    const allAArray = Array.from(allAChunks);
    const allBArray = Array.from(allBChunks);
    const intersection = new Set(allAArray.filter((x) => allBChunks.has(x)));
    const union = new Set(allAArray.concat(allBArray));
    const jaccard = union.size > 0 ? Math.round((intersection.size / union.size) * 100) : 0;
    const uniqueACount = allAChunks.size - intersection.size;
    const uniqueBCount = allBChunks.size - intersection.size;
    const total = union.size || 1;

    return {
      jaccard,
      uniqueA: Math.round((uniqueACount / total) * 100),
      shared: Math.round((intersection.size / total) * 100),
      uniqueB: Math.round((uniqueBCount / total) * 100),
      sharedCount: intersection.size,
      uniqueACount,
      uniqueBCount,
    };
  }, [comparisonAB]);

  // Relative Radar Chart Geometry with Dynamic Bounds
  const radarData = useMemo(() => {
    const factors = [
      { key: "faithfulness", label: "Faithfulness" },
      { key: "relevance", label: "Relevance" },
      { key: "precision", label: "Precision" },
      { key: "recall", label: "Context Recall" },
      { key: "latencyEff", label: "Latency Eff." },
      { key: "costEff", label: "Cost Eff." },
    ];

    const cx = 200;
    const cy = 155;
    const R = 110;

    // Dynamic latency bounds
    const latencies = pipelineMetrics.map((p) => p.latency).filter((l) => l > 0);
    const minLat = latencies.length > 0 ? Math.min(...latencies) * 0.8 : 200;
    const maxLat = latencies.length > 0 ? Math.max(...latencies) * 1.2 : 1500;

    // Dynamic cost bounds
    const costs = pipelineMetrics.map((p) => p.cost).filter((c) => c > 0);
    const maxCost = costs.length > 0 ? Math.max(...costs) * 1.2 : 0.01;

    const getPoint = (factorIdx: number, normalizedVal: number) => {
      const angle = (factorIdx * 60 - 90) * (Math.PI / 180);
      const val = Math.max(0.1, Math.min(1.0, normalizedVal));
      return {
        x: cx + R * val * Math.cos(angle),
        y: cy + R * val * Math.sin(angle),
      };
    };

    const polygons = pipelineMetrics.map((p) => {
      // Scale latency inversely: lower latency = higher efficiency score
      const latNorm =
        maxLat > minLat
          ? Math.max(0.15, Math.min(1.0, 1 - (p.latency - minLat) / (maxLat - minLat)))
          : 0.8;
      // Scale cost inversely: lower cost = higher efficiency score
      const costNorm =
        maxCost > 0
          ? Math.max(0.15, Math.min(1.0, 1 - p.cost / maxCost))
          : 0.9;

      const vals = [
        p.faithfulness,
        p.relevance,
        p.precision,
        p.recall,
        latNorm,
        costNorm,
      ];

      const points = vals.map((v, i) => getPoint(i, v));
      const pointsString = points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");

      return {
        ...p,
        pointsString,
        points,
      };
    });

    return { cx, cy, R, factors, polygons, getPoint };
  }, [pipelineMetrics]);

  // Failure analysis summary for Diagnostic Autopsy
  const failureSummary = useMemo(() => {
    if (!candidateFailures || candidateFailures.length === 0) return null;
    const hallucinations = candidateFailures.filter((f) => f.failure_type === "hallucination");
    const lowRecalls = candidateFailures.filter((f) => f.failure_type === "low_recall");
    const lowPrecisions = candidateFailures.filter((f) => f.failure_type === "low_precision");
    const highLatencies = candidateFailures.filter((f) => f.failure_type === "high_latency");
    return {
      total: candidateFailures.length,
      hallucinations: hallucinations.length,
      lowRecalls: lowRecalls.length,
      lowPrecisions: lowPrecisions.length,
      highLatencies: highLatencies.length,
      topFailure: candidateFailures[0],
    };
  }, [candidateFailures]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Pipeline Comparison</h1>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-xs border border-indigo-500/30">
              multi-pipeline
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Multi-pipeline delta analysis, 6-factor radar trade-offs, chunk overlap telemetry, and per-query diff inspections.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={showDisagreementsOnly}
              onChange={(e) => setShowDisagreementsOnly(e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
            />
            <span className="text-xs text-slate-200 font-medium flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Show Disagreements Only
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono font-semibold">
              {totalDisagreementsCount}
            </span>
          </label>
        </div>
      </div>

      {/* Multi-Pipeline Selector Strip (2 to 4 Pipelines) */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Comparing ({activePipelines.length} Active):
            </span>

            {/* Render Active Pipeline Pills */}
            {activePipelines.map((p, idx) => (
              <div
                key={p.runId}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border ${p.bgBadge} ${p.borderBadge} ${p.textBadge}`}
              >
                <span className={`w-2 h-2 rounded-full ${p.dotColor}`} />
                <strong className="font-semibold">Pipe {p.letter}:</strong>
                <span className="text-white max-w-[140px] truncate">{p.name}</span>
                <button
                  onClick={() => handleRemovePipeline(idx)}
                  className="hover:text-rose-400 ml-1 p-0.5 rounded transition-colors cursor-pointer"
                  title="Remove from comparison"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add Pipeline Dropdown */}
            {activePipelines.length < 4 && (
              <div className="relative">
                <button
                  onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                  className="h-8 px-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Add Pipeline ({activePipelines.length}/4)</span>
                </button>

                {addDropdownOpen && (
                  <div className="absolute left-0 top-10 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase px-2 py-1">
                      Select Candidate Run
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {experiments
                        ?.filter((r) => !selectedRunIds.includes(r.id))
                        .map((r) => (
                          <div
                            key={r.id}
                            onClick={() => handleAddPipeline(r.id)}
                            className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 cursor-pointer flex items-center justify-between border border-slate-800/80 transition-colors"
                          >
                            <div className="truncate mr-2">
                              <div className="text-xs font-medium text-white truncate">
                                {r.name || `Run ${r.id.slice(0, 8)}`}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Status: {r.status} • Prec: {r.avg_context_precision?.toFixed(2) ?? "—"}
                              </div>
                            </div>
                            <Plus className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Select Baseline & Candidate dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={runAId}
              onChange={(e) => {
                const next = [...selectedRunIds];
                next[0] = e.target.value;
                setSelectedRunIds(next);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
            >
              <option value="">Baseline (Pipe A)...</option>
              {experiments?.map((r) => (
                <option key={r.id} value={r.id}>
                  A: {r.name || r.id.slice(0, 8)}
                </option>
              ))}
            </select>

            <select
              value={runBId}
              onChange={(e) => {
                const next = [...selectedRunIds];
                next[1] = e.target.value;
                setSelectedRunIds(next);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
            >
              <option value="">Candidate (Pipe B)...</option>
              {experiments
                ?.filter((r) => r.id !== runAId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    B: {r.name || r.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Diff & Telemetry Body */}
      {isCompLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <span className="text-xs font-mono">Computing multi-pipeline diff matrices and chunk alignments...</span>
        </div>
      ) : activePipelines.length >= 2 && comparisonAB ? (
        <div className="space-y-8">
          {/* Top Section (Split 45% / 55%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT 45%: Radar Chart & Metric Comparison */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Radar className="h-4 w-4 text-indigo-400" />
                    <h2 className="text-sm font-semibold text-white">6-Factor Trade-off Radar</h2>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {radarData.polygons.map((p) => (
                      <span
                        key={p.runId}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${p.bgBadge} ${p.textBadge} font-mono font-semibold`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${p.dotColor}`} />
                        Pipe {p.letter}
                      </span>
                    ))}
                  </div>
                </div>

                {/* SVG Radar Visualization */}
                <div className="relative w-full aspect-[4/3] bg-slate-950/60 rounded-xl flex items-center justify-center p-2 border border-slate-900 overflow-visible">
                  <svg className="w-full h-full max-h-[260px] overflow-visible" viewBox="0 0 400 320">
                    <defs>
                      <linearGradient id="gradRadarA" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="gradRadarB" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="gradRadarC" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="gradRadarD" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>

                    {/* Concentric Background Grid Rings */}
                    {[1.0, 0.66, 0.33].map((scale, sIdx) => {
                      const ringPoints = [0, 1, 2, 3, 4, 5]
                        .map((i) => radarData.getPoint(i, scale))
                        .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
                        .join(" ");
                      return (
                        <polygon
                          key={sIdx}
                          fill="none"
                          points={ringPoints}
                          stroke="#334155"
                          strokeDasharray={scale === 1.0 ? "none" : "2,2"}
                          strokeWidth="1"
                        />
                      );
                    })}

                    {/* Spoke Axis Lines */}
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                      const p = radarData.getPoint(i, 1.0);
                      return (
                        <line
                          key={i}
                          stroke="#1e293b"
                          strokeWidth="1"
                          x1={radarData.cx}
                          y1={radarData.cy}
                          x2={p.x}
                          y2={p.y}
                        />
                      );
                    })}

                    {/* Metric Axis Labels */}
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="middle" x="200" y="28">
                      Faithfulness
                    </text>
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="start" x="325" y="95">
                      Relevance
                    </text>
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="start" x="325" y="222">
                      Precision
                    </text>
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="middle" x="200" y="292">
                      Context Recall
                    </text>
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="end" x="75" y="222">
                      Latency Eff.
                    </text>
                    <text className="fill-slate-300 font-mono text-[10px] font-semibold" textAnchor="end" x="75" y="95">
                      Cost Eff.
                    </text>

                    {/* Overlay Polygons for Active Pipelines */}
                    {radarData.polygons.map((p, idx) => {
                      const gradId =
                        idx === 0
                          ? "url(#gradRadarA)"
                          : idx === 1
                          ? "url(#gradRadarB)"
                          : idx === 2
                          ? "url(#gradRadarC)"
                          : "url(#gradRadarD)";
                      return (
                        <g key={p.runId}>
                          <polygon
                            fill={gradId}
                            points={p.pointsString}
                            stroke={p.color}
                            strokeWidth="2"
                            strokeDasharray={idx > 1 ? "3,2" : "none"}
                          />
                          {p.points.map((pt, ptIdx) => (
                            <circle
                              key={ptIdx}
                              cx={pt.x}
                              cy={pt.y}
                              fill={p.color}
                              r={idx === 0 ? "4" : "3.5"}
                            />
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Factor Delta Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-900/80 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                        <th className="py-2 px-3">Metric</th>
                        {activePipelines.map((p) => (
                          <th key={p.runId} className={`py-2 px-2 font-semibold ${p.textBadge}`}>
                            {p.letter}
                          </th>
                        ))}
                        <th className="py-2 px-3 text-right">Delta (A vs B)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-xs text-slate-200">
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-300">Faithfulness</td>
                        {pipelineMetrics.map((p) => (
                          <td key={p.runId} className="py-2 px-2 font-semibold">
                            {p.faithfulness.toFixed(3)}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold">
                          <span
                            className={
                              comparisonAB.diffs.faithfulness >= 0 ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {comparisonAB.diffs.faithfulness >= 0 ? "+" : ""}
                            {(comparisonAB.diffs.faithfulness * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-300">Context Precision</td>
                        {pipelineMetrics.map((p) => (
                          <td key={p.runId} className="py-2 px-2 font-semibold">
                            {p.precision.toFixed(3)}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold">
                          <span
                            className={
                              comparisonAB.diffs.context_precision >= 0 ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {comparisonAB.diffs.context_precision >= 0 ? "+" : ""}
                            {(comparisonAB.diffs.context_precision * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-300">Context Recall</td>
                        {pipelineMetrics.map((p) => (
                          <td key={p.runId} className="py-2 px-2 font-semibold">
                            {p.recall.toFixed(3)}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold">
                          <span
                            className={
                              comparisonAB.diffs.context_recall >= 0 ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {comparisonAB.diffs.context_recall >= 0 ? "+" : ""}
                            {(comparisonAB.diffs.context_recall * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-300">Avg Latency</td>
                        {pipelineMetrics.map((p) => (
                          <td key={p.runId} className="py-2 px-2 font-semibold">
                            {p.latency.toFixed(0)}ms
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold">
                          <span
                            className={
                              comparisonAB.diffs.latency_ms <= 0 ? "text-emerald-400" : "text-amber-400"
                            }
                          >
                            {comparisonAB.diffs.latency_ms > 0 ? "+" : ""}
                            {comparisonAB.diffs.latency_ms.toFixed(0)}ms
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT 55%: Winner Champion Card & Root-Cause Autopsy */}
            <div className="lg:col-span-7 space-y-6">
              {championPipeline && runnerUpPipeline && (
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Recommended Champion
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Winner in {metricsWonCount} of 6 dimensions
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white mt-1">
                        Pipeline {championPipeline.letter}: {championPipeline.name}
                      </h3>
                    </div>
                    <div className="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Top Composite Performance
                    </div>
                  </div>

                  {/* Dynamic 3 Primary Advantage Tiles */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Faithfulness Lead
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-emerald-400 font-mono">
                          {championPipeline.faithfulness.toFixed(3)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {championPipeline.faithfulness >= runnerUpPipeline.faithfulness
                            ? `+${((championPipeline.faithfulness - runnerUpPipeline.faithfulness) * 100).toFixed(1)}%`
                            : "Candidate"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {championPipeline.faithfulness >= 0.85
                          ? "High grounding with zero detected severe hallucinations."
                          : "Stronger factual adherence over candidate configurations."}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Latency Profile
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-indigo-400 font-mono">
                          {championPipeline.latency.toFixed(0)}ms
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {runnerUpPipeline.latency > championPipeline.latency
                            ? `-${Math.round(runnerUpPipeline.latency - championPipeline.latency)}ms`
                            : "Response"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {championPipeline.latency <= 800
                          ? "Swift vector retrieval & generation response roundtrip."
                          : "Balanced throughput for high-precision retrieval depth."}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Grounding Precision
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-emerald-400 font-mono">
                          {championPipeline.precision.toFixed(3)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {championPipeline.precision >= runnerUpPipeline.precision
                            ? `+${((championPipeline.precision - runnerUpPipeline.precision) * 100).toFixed(1)}%`
                            : "Prec@k"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {championPipeline.precision >= 0.8
                          ? "Maintains high relevance inside retrieved chunk context."
                          : "Retrieval depth captures necessary benchmark evidence."}
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Diagnostic Autopsy Card (Backed by api.getFailures) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/90 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Diagnostic Autopsy: Candidate Performance Analysis
                      </div>
                      {failureSummary && (
                        <span className="text-[10px] font-mono text-rose-400 font-semibold px-1.5 py-0.2 rounded bg-rose-500/10 border border-rose-500/20">
                          {failureSummary.total} Degraded Items Detected
                        </span>
                      )}
                    </div>

                    {isFailuresLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                        <span>Querying candidate failure analysis...</span>
                      </div>
                    ) : failureSummary ? (
                      <div className="space-y-1 text-xs text-slate-300">
                        <p className="leading-relaxed font-sans">
                          Candidate run (Pipe B) registered {failureSummary.total} failure instances:{" "}
                          <span className="text-rose-400 font-semibold">
                            {failureSummary.hallucinations} hallucinations
                          </span>{" "}
                          (&lt; 0.70 faithfulness),{" "}
                          <span className="text-amber-400 font-semibold">
                            {failureSummary.lowRecalls} low recall misses
                          </span>{" "}
                          (&lt; 0.60), and{" "}
                          <span className="text-cyan-400 font-semibold">
                            {failureSummary.lowPrecisions} low precision queries
                          </span>
                          .
                        </p>
                        {failureSummary.topFailure && (
                          <div className="text-[11px] bg-slate-900/80 p-2 rounded-lg border border-slate-800 mt-1 font-mono text-slate-400">
                            <span className="text-amber-400 font-bold mr-1.5">Sample Flag:</span>
                            &ldquo;{failureSummary.topFailure.question}&rdquo; (Score:{" "}
                            {failureSummary.topFailure.score.toFixed(2)})
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        Candidate pipeline passed core grounding thresholds without severe hallucination
                        or precision degradation on this evaluation dataset.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Chunk Overlap & Retrieval Telemetry Card (Fully Dynamic) */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    Chunk Overlap &amp; Retrieval Telemetry
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    Jaccard Overlap: {overlapStats ? `${overlapStats.jaccard}%` : "—"}
                  </span>
                </div>

                {overlapStats ? (
                  <>
                    <p className="text-xs text-slate-400">
                      {overlapStats.sharedCount} chunks shared across pipelines, {overlapStats.uniqueACount} unique to Pipe A, and {overlapStats.uniqueBCount} unique to Pipe B.
                    </p>

                    {/* Segmented Progress Bar */}
                    <div className="w-full bg-slate-950 rounded-full h-2.5 flex overflow-hidden border border-slate-800">
                      <div
                        className="bg-indigo-500 h-full"
                        style={{ width: `${overlapStats.uniqueA}%` }}
                        title={`Pipe A Unique: ${overlapStats.uniqueA}%`}
                      />
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${overlapStats.shared}%` }}
                        title={`Shared Overlap: ${overlapStats.shared}%`}
                      />
                      <div
                        className="bg-cyan-500 h-full"
                        style={{ width: `${overlapStats.uniqueB}%` }}
                        title={`Pipe B Unique: ${overlapStats.uniqueB}%`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                      <span className="text-indigo-400 font-semibold">Pipe A Unique ({overlapStats.uniqueA}%)</span>
                      <span className="text-emerald-400 font-semibold">Shared Overlap ({overlapStats.shared}%)</span>
                      <span className="text-cyan-400 font-semibold">Pipe B Unique ({overlapStats.uniqueB}%)</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-500 py-3 flex items-center gap-2">
                    <Info className="h-4 w-4 text-slate-600" />
                    <span>Retrieved chunk identifier telemetry was not recorded for these benchmark runs.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Section: Synchronized Per-Query Diff Inspector */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Per-Question Answer &amp; Context Diff ({filteredTestCases.length} Questions)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Side-by-side evaluation of responses, grounding citations, and precision scores across active pipelines.
                </p>
              </div>

              {/* Search Filter Input */}
              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter queries or answers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Test Case Cards */}
            <div className="space-y-4">
              {filteredTestCases.map((tc, idx) => {
                return (
                  <div
                    key={tc.test_case_id}
                    className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 hover:border-slate-700 transition-colors"
                  >
                    {/* Question Header & Disagreement Tag */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-indigo-400">Q{idx + 1}:</span>
                        <span className="text-xs font-semibold text-white">{tc.question}</span>
                      </div>
                      {tc.isDisagreement && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Diff Detected
                        </span>
                      )}
                    </div>

                    {/* Ground Truth Golden Box */}
                    <div className="text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-900 space-y-1">
                      <strong className="text-[11px] uppercase tracking-wider text-slate-500 block">
                        Verified Ground Truth (Gold Standard):
                      </strong>
                      <div className="font-mono text-xs text-slate-200">{tc.ground_truth_answer}</div>
                    </div>

                    {/* Side-by-Side Multi-Column Grid */}
                    <div
                      className={`grid grid-cols-1 ${
                        activePipelines.length === 2
                          ? "md:grid-cols-2"
                          : activePipelines.length === 3
                          ? "md:grid-cols-3"
                          : "md:grid-cols-2 lg:grid-cols-4"
                      } gap-4 pt-1`}
                    >
                      {/* Pipeline A Column */}
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-800/60">
                          <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            Pipe A (Baseline)
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
                            Prec: {tc.run_a_precision?.toFixed(2) ?? "—"} | Lat: {tc.run_a_latency_ms?.toFixed(0) ?? "—"}ms
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans min-h-[48px]">
                          {tc.run_a_answer || "No response generated"}
                        </p>
                        {tc.run_a_chunks && tc.run_a_chunks.length > 0 && (
                          <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Layers className="h-3 w-3 text-indigo-400" />
                            <span>{tc.run_a_chunks.length} chunks retrieved</span>
                          </div>
                        )}
                      </div>

                      {/* Pipeline B Column */}
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-800/60">
                          <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
                            <span className="w-2 h-2 rounded-full bg-cyan-500" />
                            Pipe B (Candidate)
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
                            Prec: {tc.run_b_precision?.toFixed(2) ?? "—"} | Lat: {tc.run_b_latency_ms?.toFixed(0) ?? "—"}ms
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans min-h-[48px]">
                          {tc.run_b_answer || "No response generated"}
                        </p>
                        {tc.run_b_chunks && tc.run_b_chunks.length > 0 && (
                          <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Layers className="h-3 w-3 text-cyan-400" />
                            <span>{tc.run_b_chunks.length} chunks retrieved</span>
                          </div>
                        )}
                      </div>

                      {/* Pipeline C Column (if present) */}
                      {runCId && (
                        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-800/60">
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Pipe C
                            </div>
                            <span className="text-slate-400 font-mono text-[10px]">
                              Prec: {tc.run_c_precision?.toFixed(2) ?? "—"} | Lat: {tc.run_c_latency_ms?.toFixed(0) ?? "—"}ms
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-sans min-h-[48px]">
                            {tc.run_c_answer || "No response generated"}
                          </p>
                          {tc.run_c_chunks && tc.run_c_chunks.length > 0 && (
                            <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                              <Layers className="h-3 w-3 text-emerald-400" />
                              <span>{tc.run_c_chunks.length} chunks retrieved</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pipeline D Column (if present) */}
                      {runDId && (
                        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-800/60">
                            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              Pipe D
                            </div>
                            <span className="text-slate-400 font-mono text-[10px]">
                              Prec: {tc.run_d_precision?.toFixed(2) ?? "—"} | Lat: {tc.run_d_latency_ms?.toFixed(0) ?? "—"}ms
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-sans min-h-[48px]">
                            {tc.run_d_answer || "No response generated"}
                          </p>
                          {tc.run_d_chunks && tc.run_d_chunks.length > 0 && (
                            <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                              <Layers className="h-3 w-3 text-amber-400" />
                              <span>{tc.run_d_chunks.length} chunks retrieved</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel text-center py-20 px-4 rounded-2xl border border-slate-800 text-slate-400 text-xs space-y-2">
          <GitCompare className="h-8 w-8 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-300 font-medium">Select at least two distinct experiment runs above.</p>
          <p className="text-slate-500 max-w-md mx-auto">
            Choose Pipeline Run A (Baseline) and Pipeline Run B (Candidate) from the dropdowns to unlock multi-pipeline radar comparisons, Jaccard telemetry, and question diffs.
          </p>
        </div>
      )}
    </div>
  );
}
