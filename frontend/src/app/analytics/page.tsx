"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api } from "@/lib/api";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Clock,
  Coins,
  FileWarning,
  HelpCircle,
  Loader2,
  TrendingUp,
} from "lucide-react";

export default function AnalyticsTradeOffsPage() {
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: tradeoffPoints, isLoading: loadingTradeoffs } = useQuery({
    queryKey: ["tradeoff-points"],
    queryFn: api.getTradeOffPoints,
  });

  const { data: experiments } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.getExperiments(),
  });

  const activeRunId = selectedRunId || (experiments && experiments[0]?.id);

  const { data: failures, isLoading: loadingFailures } = useQuery({
    queryKey: ["failures", activeRunId],
    queryFn: () => (activeRunId ? api.getFailures(activeRunId) : []),
    enabled: !!activeRunId,
  });

  const filteredFailures =
    failures?.filter((f) => (filterType === "all" ? true : f.failure_type === filterType)) || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Visual Trade-Off Plots & Failure Analysis</h2>
        <p className="text-xs text-slate-400 mt-1">
          Explore Pareto frontiers for Cost vs. Accuracy and Latency vs. Recall, and perform deep failure root-cause analysis on hallucinations and context misses.
        </p>
      </div>

      {/* Trade-Off Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Cost vs. Accuracy */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white flex items-center space-x-2">
              <Coins className="h-4 w-4 text-amber-400" />
              <span>Cost (USD) vs. Accuracy (Context Precision)</span>
            </h3>
            <span className="text-[10px] text-slate-400">Pareto Frontier</span>
          </div>

          <div className="h-64 w-full">
            {loadingTradeoffs ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-indigo-400" />
                Loading trade-off points...
              </div>
            ) : tradeoffPoints && tradeoffPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="cost_usd"
                    name="Cost (USD)"
                    unit="$"
                    stroke="#64748b"
                    fontSize={10}
                  />
                  <YAxis
                    type="number"
                    dataKey="context_precision"
                    name="Precision"
                    domain={[0, 1]}
                    stroke="#64748b"
                    fontSize={10}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-xs space-y-1 shadow-xl">
                          <p className="font-semibold text-white">{data.run_name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{data.config_label}</p>
                          <p className="text-indigo-400 font-mono">Precision: {data.context_precision}</p>
                          <p className="text-amber-400 font-mono">Cost: ${data.cost_usd}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Runs" data={tradeoffPoints} fill="#6366f1" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No completed runs with cost data yet.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Latency vs. Recall */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white flex items-center space-x-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span>Latency (ms) vs. Context Recall</span>
            </h3>
            <span className="text-[10px] text-slate-400">Speed vs. Coverage</span>
          </div>

          <div className="h-64 w-full">
            {loadingTradeoffs ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-indigo-400" />
                Loading trade-off points...
              </div>
            ) : tradeoffPoints && tradeoffPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="latency_ms"
                    name="Latency (ms)"
                    unit="ms"
                    stroke="#64748b"
                    fontSize={10}
                  />
                  <YAxis
                    type="number"
                    dataKey="context_recall"
                    name="Recall"
                    domain={[0, 1]}
                    stroke="#64748b"
                    fontSize={10}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-xs space-y-1 shadow-xl">
                          <p className="font-semibold text-white">{data.run_name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{data.config_label}</p>
                          <p className="text-emerald-400 font-mono">Recall: {data.context_recall}</p>
                          <p className="text-slate-300 font-mono">Latency: {data.latency_ms} ms</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Runs" data={tradeoffPoints} fill="#10b981" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No completed runs with latency data yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Failure Analysis Inspector */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center space-x-2">
              <FileWarning className="h-4 w-4 text-rose-400" />
              <span>Failure Analysis & Hallucination Inspector</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect test cases where generated answers hallucinated or where retrieval failed to capture ground-truth passages.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Run Selector */}
            <select
              value={activeRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              {experiments?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || `Run ${r.id.slice(0, 8)}`}
                </option>
              ))}
            </select>

            {/* Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="all">All Failure Types</option>
              <option value="hallucination">Hallucinations (&lt;0.70 Faithfulness)</option>
              <option value="low_recall">Low Context Recall (&lt;0.60)</option>
              <option value="low_precision">Low Context Precision (&lt;0.50)</option>
              <option value="high_latency">High Latency (&gt;4000ms)</option>
            </select>
          </div>
        </div>

        {/* Failures List */}
        {loadingFailures ? (
          <div className="flex items-center justify-center py-12 text-slate-400 space-x-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <span className="text-xs">Analyzing failure queries...</span>
          </div>
        ) : filteredFailures.length > 0 ? (
          <div className="space-y-4">
            {filteredFailures.map((item) => (
              <div
                key={item.result_id}
                className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{item.question}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                      item.failure_type === "hallucination"
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {item.failure_type} (Score: {item.score.toFixed(2)})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <strong className="text-slate-400 block mb-1">Expected Ground Truth:</strong>
                    <p className="text-slate-200">{item.ground_truth_answer}</p>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-rose-900/30">
                    <strong className="text-rose-400 block mb-1">Generated Response:</strong>
                    <p className="text-slate-200">{item.generated_answer || "No response"}</p>
                  </div>
                </div>

                {item.retrieved_chunks && item.retrieved_chunks.length > 0 && (
                  <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                    <strong className="text-slate-500 block mb-1">Retrieved Context Passages:</strong>
                    <div className="line-clamp-3 font-mono">
                      {item.retrieved_chunks.map((c) => c.content).join(" [...] ")}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            No failures detected matching the current filter. This run performed within quality thresholds!
          </div>
        )}
      </div>
    </div>
  );
}
