"use client";

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Document, DocumentChunk, ModelInfo } from "@/types";
import { ModelStatusBadge } from "@/components/ModelStatusBadge";
import { ModelDownloadModal } from "@/components/ModelDownloadModal";
import {
  AlertCircle,
  ArrowDownRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Eye,
  FileCode,
  FileText,
  Filter,
  GitBranch,
  Layers,
  Loader2,
  Network,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Strategy & Parameter states
  const [chunkStrategy, setChunkStrategy] = useState<string>("recursive");
  
  // Recursive parameters
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [chunkOverlap, setChunkOverlap] = useState<number>(50);

  // Semantic parameters
  const [semanticThreshold, setSemanticThreshold] = useState<number>(0.75);
  const [semanticThresholdType, setSemanticThresholdType] = useState<string>("percentile");

  // Parent-Document parameters
  const [parentChunkSize, setParentChunkSize] = useState<number>(1500);
  const [parentChunkOverlap, setParentChunkOverlap] = useState<number>(150);
  const [childChunkSize, setChildChunkSize] = useState<number>(300);
  const [childChunkOverlap, setChildChunkOverlap] = useState<number>(30);

  // Token Window parameters
  const [tokenChunkSize, setTokenChunkSize] = useState<number>(512);
  const [tokenChunkOverlap, setTokenChunkOverlap] = useState<number>(64);

  // Embedding Model for Vector Indexing
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState<string>("BAAI/bge-small-en-v1.5");

  // Download modal state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [modelsToDownload, setModelsToDownload] = useState<any[]>([]);

  const [activeDocForChunks, setActiveDocForChunks] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<"hierarchical" | "flat">("hierarchical");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: api.getDocuments,
  });

  const { data: allModels } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.getModels(),
    refetchInterval: 10000,
  });

  // Auto-select downloaded embedding model if available
  useEffect(() => {
    if (allModels && allModels.length > 0) {
      const readyEmb = allModels.find((m) => m.type === "embedding" && m.is_downloaded);
      if (readyEmb) {
        setSelectedEmbeddingModel(readyEmb.name);
      }
    }
  }, [allModels]);

  const modelMap = useMemo(() => {
    const map = new Map<string, ModelInfo>();
    if (allModels) {
      for (const m of allModels) {
        map.set(m.name, m);
      }
    }
    return map;
  }, [allModels]);

  const { data: chunks, isLoading: loadingChunks } = useQuery({
    queryKey: ["document-chunks", activeDocForChunks?.id],
    queryFn: () => (activeDocForChunks ? api.getDocumentChunks(activeDocForChunks.id) : []),
    enabled: !!activeDocForChunks,
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  // Group chunks into hierarchical parent-child structure
  const { hasHierarchy, parentGroups, standaloneChunks } = useMemo(() => {
    if (!chunks || chunks.length === 0) {
      return { hasHierarchy: false, parentGroups: [], standaloneChunks: [] };
    }

    const hasParentStrategy = chunks.some(
      (c) =>
        c.chunk_strategy.includes("parent") ||
        c.parent_chunk_id !== null ||
        c.chunk_metadata?.is_parent === true ||
        c.chunk_metadata?.is_child === true
    );

    if (!hasParentStrategy) {
      return { hasHierarchy: false, parentGroups: [], standaloneChunks: chunks };
    }

    // Find parent chunks
    const parents = chunks.filter(
      (c) =>
        c.chunk_metadata?.is_parent === true ||
        (!c.parent_chunk_id && chunks.some((other) => other.parent_chunk_id === c.id))
    );

    const parentIdSet = new Set(parents.map((p) => p.id));

    // Map children to parents
    const groups = parents.map((parent) => {
      const children = chunks.filter(
        (c) =>
          c.parent_chunk_id === parent.id ||
          (c.chunk_metadata?.parent_id &&
            (c.chunk_metadata.parent_id === parent.id ||
              c.chunk_metadata.parent_id === parent.chunk_metadata?.parent_id))
      );
      return {
        parent,
        children,
      };
    });

    const handledChildIds = new Set(groups.flatMap((g) => g.children.map((c) => c.id)));
    const standalone = chunks.filter(
      (c) => !parentIdSet.has(c.id) && !handledChildIds.has(c.id)
    );

    return {
      hasHierarchy: groups.length > 0,
      parentGroups: groups,
      standaloneChunks: standalone,
    };
  }, [chunks]);

  const toggleExpand = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: prev[parentId] === undefined ? false : !prev[parentId],
    }));
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      let strategyConfig: any = { type: chunkStrategy };
      if (chunkStrategy === "recursive") {
        strategyConfig = {
          type: "recursive",
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        };
      } else if (chunkStrategy === "semantic") {
        const embInfo = modelMap.get(selectedEmbeddingModel);
        strategyConfig = {
          type: "semantic",
          threshold: semanticThreshold,
          threshold_type: semanticThresholdType,
          embedding_provider: embInfo?.provider || (selectedEmbeddingModel.includes("bge") ? "fastembed" : "ollama"),
          embedding_model: selectedEmbeddingModel,
        };
      } else if (chunkStrategy === "parent_document") {
        strategyConfig = {
          type: "parent_document",
          parent_chunk_size: parentChunkSize,
          parent_chunk_overlap: parentChunkOverlap,
          child_chunk_size: childChunkSize,
          child_chunk_overlap: childChunkOverlap,
        };
      } else if (chunkStrategy === "token_window") {
        strategyConfig = {
          type: "token_window",
          chunk_size: tokenChunkSize,
          chunk_overlap: tokenChunkOverlap,
        };
      }

      const embInfo = modelMap.get(selectedEmbeddingModel);
      const embProvider = embInfo?.provider || (selectedEmbeddingModel.includes("bge") || selectedEmbeddingModel.includes("minilm") ? "fastembed" : selectedEmbeddingModel.includes("nomic") ? "ollama" : "openai");

      formData.append("chunk_strategies_json", JSON.stringify([strategyConfig]));
      formData.append("embedding_provider", embProvider);
      formData.append("embedding_model", selectedEmbeddingModel);

      return api.uploadDocument(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelectedFile(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (activeDocForChunks) setActiveDocForChunks(null);
    },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Documents & Chunk Ingestion</h2>
        <p className="text-xs text-slate-400 mt-1">
          Upload multi-format files (PDF, DOCX, Markdown, TXT) and preview chunking boundaries across strategies.
        </p>
      </div>

      {/* Upload Zone & Config Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
        <div className="flex items-center space-x-2 text-sm font-semibold text-white">
          <UploadCloud className="h-4 w-4 text-indigo-400" />
          <span>Upload Document & Configure Chunking Strategy</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Dropzone */}
          <div className="lg:col-span-2 flex flex-col h-full">
            <label className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/50 bg-slate-900/30 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all flex-1 h-full w-full">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.txt,.md,.markdown"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                <FileCode className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-slate-200 mb-1">
                {selectedFile ? (
                  <span className="text-indigo-400 font-semibold">{selectedFile.name}</span>
                ) : (
                  "Drag & drop file or click to browse"
                )}
              </p>
              <p className="text-xs text-slate-500">
                Supports PDF, Markdown (.md), DOCX, and Plain Text (.txt)
              </p>
            </label>
          </div>

          {/* Chunking Settings */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between h-full">
            <div className="space-y-3.5">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Initial Ingestion Strategy
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Strategy Type</label>
                <select
                  value={chunkStrategy}
                  onChange={(e) => setChunkStrategy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="recursive">Recursive Character Splitting</option>
                  <option value="semantic">Semantic Similarity Chunking</option>
                  <option value="parent_document">Parent-Document (Hierarchical)</option>
                  <option value="token_window">Token-Based Windowing</option>
                </select>
              </div>

            {chunkStrategy === "recursive" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Chunk Size (chars)</label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Overlap (chars)</label>
                  <input
                    type="number"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {chunkStrategy === "semantic" && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Breakpoint Type</label>
                    <select
                      value={semanticThresholdType}
                      onChange={(e) => setSemanticThresholdType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="percentile">Percentile</option>
                      <option value="standard_deviation">Std Deviation</option>
                      <option value="interquartile">Interquartile</option>
                      <option value="gradient">Gradient</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Threshold {semanticThresholdType === "percentile" ? "(0.0 - 1.0)" : "Amount"}
                    </label>
                    <input
                      type="number"
                      step={semanticThresholdType === "percentile" ? "0.05" : "0.5"}
                      value={semanticThreshold}
                      onChange={(e) => setSemanticThreshold(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  💡 Computes semantic cosine distance between consecutive sentences and splits when similarity drops below threshold.
                </p>
              </div>
            )}

            {chunkStrategy === "parent_document" && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-purple-300 font-semibold block mb-1">
                      Parent Size (chars)
                    </label>
                    <input
                      type="number"
                      value={parentChunkSize}
                      onChange={(e) => setParentChunkSize(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-purple-800/60 rounded-lg px-2.5 py-1.5 text-xs text-purple-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-purple-300 font-semibold block mb-1">
                      Parent Overlap (chars)
                    </label>
                    <input
                      type="number"
                      value={parentChunkOverlap}
                      onChange={(e) => setParentChunkOverlap(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-purple-800/60 rounded-lg px-2.5 py-1.5 text-xs text-purple-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-emerald-300 font-semibold block mb-1">
                      Child Size (chars)
                    </label>
                    <input
                      type="number"
                      value={childChunkSize}
                      onChange={(e) => setChildChunkSize(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-emerald-800/60 rounded-lg px-2.5 py-1.5 text-xs text-emerald-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-emerald-300 font-semibold block mb-1">
                      Child Overlap (chars)
                    </label>
                    <input
                      type="number"
                      value={childChunkOverlap}
                      onChange={(e) => setChildChunkOverlap(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-emerald-800/60 rounded-lg px-2.5 py-1.5 text-xs text-emerald-200"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  💡 High-precision retrieval matches small child chunks, while returning full parent context to the LLM.
                </p>
              </div>
            )}

            {chunkStrategy === "token_window" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Window Size (tokens)</label>
                  <input
                    type="number"
                    value={tokenChunkSize}
                    onChange={(e) => setTokenChunkSize(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Window Overlap (tokens)</label>
                  <input
                    type="number"
                    value={tokenChunkOverlap}
                    onChange={(e) => setTokenChunkOverlap(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {/* Embedding Model Selector */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Vector Embedding Model</span>
                </label>
                {modelMap.get(selectedEmbeddingModel) && (
                  <ModelStatusBadge model={modelMap.get(selectedEmbeddingModel)!} />
                )}
              </div>
              <select
                value={selectedEmbeddingModel}
                onChange={(e) => setSelectedEmbeddingModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {[
                  { id: "BAAI/bge-small-en-v1.5", label: "BAAI/bge-small-en-v1.5 (FastEmbed ONNX)" },
                  { id: "BAAI/bge-large-en-v1.5", label: "BAAI/bge-large-en-v1.5 (FastEmbed ONNX)" },
                  { id: "nomic-embed-text", label: "nomic-embed-text (Ollama Local)" },
                  { id: "mxbai-embed-large", label: "mxbai-embed-large (Ollama Local)" },
                  { id: "all-minilm", label: "all-minilm (Ollama Local)" },
                  { id: "snowflake-arctic-embed", label: "snowflake-arctic-embed (Ollama Local)" },
                  { id: "text-embedding-3-small", label: "text-embedding-3-small (OpenAI Cloud)" },
                  { id: "text-embedding-3-large", label: "text-embedding-3-large (OpenAI Cloud)" },
                ].map((opt) => {
                  const mInfo = modelMap.get(opt.id);
                  const statusTag = mInfo
                    ? mInfo.is_downloaded
                      ? `🟢 [Ready - ${mInfo.size_formatted || "Cached"}]`
                      : `⬇️ [Download Needed]`
                    : "";
                  return (
                    <option key={opt.id} value={opt.id}>
                      {statusTag} {opt.label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <button
              disabled={!selectedFile || uploadMutation.isPending}
              onClick={() => {
                if (!selectedFile) return;
                const embModel = modelMap.get(selectedEmbeddingModel);
                if (embModel && !embModel.is_downloaded && embModel.provider === "ollama") {
                  setModelsToDownload([embModel]);
                  setIsDownloadModalOpen(true);
                  return;
                }
                uploadMutation.mutate(selectedFile);
              }}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-indigo-500/20"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Parsing & Indexing...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Ingest & Store Vectors</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ingested Documents Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Ingested Document Repository</h3>
          <span className="text-xs text-slate-400">{documents?.length || 0} files total</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 space-x-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <span className="text-xs">Loading documents...</span>
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Filename</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold">Pages</th>
                  <th className="pb-3 font-semibold">Chunks Indexed</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 font-medium text-slate-200 flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span>{doc.filename}</span>
                    </td>
                    <td className="py-3.5 text-slate-400">
                      {(doc.file_size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 text-slate-400">{doc.page_count || 1}</td>
                    <td className="py-3.5 text-indigo-300 font-semibold">{doc.chunk_count || 0}</td>
                    <td className="py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right space-x-3">
                      <button
                        onClick={() => setActiveDocForChunks(doc)}
                        className="inline-flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect Chunks</span>
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(doc.id)}
                        className="inline-flex items-center space-x-1 text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            No documents ingested yet. Upload a file above to begin chunking.
          </div>
        )}
      </div>

      {/* Chunk Visualizer Modal / Panel */}
      {activeDocForChunks && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 lg:p-8">
          <div className="bg-[#0b101b] border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                  <Network className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      Chunk Inspector: {activeDocForChunks.filename}
                    </h3>
                    {hasHierarchy && (
                      <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-700/50">
                        Parent-Document Hierarchy
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {chunks?.length || 0} total chunks stored in pgvector
                    {hasHierarchy && ` • ${parentGroups.length} Parent Context Blocks`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasHierarchy && (
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                    <button
                      onClick={() => setViewMode("hierarchical")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === "hierarchical"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>Hierarchical View</span>
                    </button>
                    <button
                      onClick={() => setViewMode("flat")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === "flat"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Flat List</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setActiveDocForChunks(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Search Filter Bar */}
            <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/50 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter chunks by keyword or phrase..."
                className="bg-transparent text-xs text-slate-200 placeholder-slate-400 focus:outline-none w-full font-mono"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter("")}
                  className="text-[11px] text-slate-400 hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-950/40">
              {loadingChunks ? (
                <div className="flex items-center justify-center py-16 text-slate-400 space-x-2">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                  <span className="text-xs">Loading chunk representations...</span>
                </div>
              ) : hasHierarchy && viewMode === "hierarchical" ? (
                /* HIERARCHICAL PARENT-CHILD VIEW */
                <div className="space-y-6">
                  {parentGroups
                    .filter((group) => {
                      if (!searchFilter) return true;
                      const q = searchFilter.toLowerCase();
                      return (
                        group.parent.content.toLowerCase().includes(q) ||
                        group.children.some((c) => c.content.toLowerCase().includes(q))
                      );
                    })
                    .map((group, pIdx) => {
                      const isExpanded = expandedParents[group.parent.id] !== false;
                      return (
                        <div
                          key={group.parent.id}
                          className="rounded-2xl border border-purple-500/30 bg-purple-950/10 shadow-lg shadow-purple-950/20 overflow-hidden"
                        >
                          {/* Parent Block Banner */}
                          <div className="p-4 bg-purple-950/30 border-b border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleExpand(group.parent.id)}
                                className="p-1 rounded-lg hover:bg-purple-900/40 text-purple-300 transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-purple-200 uppercase tracking-wide flex items-center gap-1.5 font-mono">
                                    <FileText className="h-3.5 w-3.5 text-purple-400" />
                                    Parent Context Block #{pIdx + 1}
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/60">
                                    {group.parent.token_count || "~"} tokens
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                                    {group.children.length} Child Chunks
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                  ID: {group.parent.id.slice(0, 18)}... • Sent to LLM when children match query
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleCopy(group.parent.id, group.parent.content)}
                              className="px-2.5 py-1 rounded-lg bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors border border-purple-700/40 self-start sm:self-auto"
                            >
                              {copiedChunkId === group.parent.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Parent Text</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Parent Content Preview */}
                          {isExpanded && (
                            <div className="p-4 space-y-4">
                              <div className="text-xs text-purple-100 font-mono leading-relaxed max-h-44 overflow-y-auto bg-purple-950/40 p-3.5 rounded-xl border border-purple-900/40 select-text whitespace-pre-wrap">
                                {group.parent.content}
                              </div>

                              {/* Child Chunks Section */}
                              <div className="pt-2">
                                <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-300">
                                  <ArrowDownRight className="h-4 w-4 text-emerald-400" />
                                  <span>Indexed Child Chunks (Indexed in pgvector for high-precision retrieval):</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l-2 border-emerald-500/20">
                                  {group.children.map((child, cIdx) => (
                                    <div
                                      key={child.id}
                                      className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 hover:border-emerald-500/50 transition-all flex flex-col justify-between"
                                    >
                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                                            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                                            Child #{cIdx + 1}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                              {child.token_count || "~"} tokens
                                            </span>
                                            <button
                                              onClick={() => handleCopy(child.id, child.content)}
                                              className="text-slate-400 hover:text-emerald-300 p-1"
                                              title="Copy chunk text"
                                            >
                                              {copiedChunkId === child.id ? (
                                                <Check className="h-3 w-3 text-emerald-400" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                        <div className="text-[11px] text-slate-300 font-mono leading-relaxed max-h-36 overflow-y-auto bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 select-text whitespace-pre-wrap">
                                          {child.content}
                                        </div>
                                      </div>

                                      <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                                        <span>Parent ref: {child.parent_chunk_id?.slice(0, 8)}...</span>
                                        <span className="text-emerald-400">Vector Indexed</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* Any standalone chunks */}
                  {standaloneChunks.length > 0 && (
                    <div className="pt-4 border-t border-slate-800">
                      <h4 className="text-xs font-bold text-slate-300 mb-3">Other Indexed Chunks</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {standaloneChunks.map((c, i) => (
                          <div
                            key={c.id}
                            className="p-4 rounded-xl bg-slate-900/90 border border-slate-800"
                          >
                            <div className="flex items-center justify-between mb-2 text-xs font-mono">
                              <span className="text-indigo-400 font-semibold">Chunk #{i + 1}</span>
                              <span className="text-slate-400">{c.token_count || "~"} tokens</span>
                            </div>
                            <div className="text-xs text-slate-300 font-mono leading-relaxed max-h-40 overflow-y-auto bg-slate-950 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap select-text">
                              {c.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : chunks && chunks.length > 0 ? (
                /* FLAT LIST VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {chunks
                    .filter((c) => !searchFilter || c.content.toLowerCase().includes(searchFilter.toLowerCase()))
                    .map((c, i) => (
                      <div
                        key={c.id}
                        className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-colors flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-mono font-semibold text-indigo-400">
                              Chunk #{i + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                                {c.token_count || "~"} tokens
                              </span>
                              <button
                                onClick={() => handleCopy(c.id, c.content)}
                                className="text-slate-400 hover:text-indigo-300 p-1"
                              >
                                {copiedChunkId === c.id ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-slate-300 leading-relaxed font-mono max-h-48 overflow-y-auto bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 whitespace-pre-wrap select-text">
                            {c.content}
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Strategy: {c.chunk_strategy}</span>
                          <span>{c.embedding_model || "pgvector"}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 text-xs">
                  No chunks found for this document.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-Flight Model Download Modal */}
      <ModelDownloadModal
        isOpen={isDownloadModalOpen}
        modelsToDownload={modelsToDownload}
        onClose={() => setIsDownloadModalOpen(false)}
        onAllCompleted={() => {
          setIsDownloadModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["models"] });
          if (selectedFile) {
            uploadMutation.mutate(selectedFile);
          }
        }}
      />
    </div>
  );
}
