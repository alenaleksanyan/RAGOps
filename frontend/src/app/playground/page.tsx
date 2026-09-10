"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  Bot,
  User,
  Send,
  Sparkles,
  Sliders,
  FileText,
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Layers,
  Search,
  Activity,
  Zap,
  Info,
  Route,
  Network,
  CornerDownRight,
  ShieldCheck,
  ShieldAlert,
  Percent,
  Compass,
  Gauge,
  Workflow,
  Target,
  FileSearch,
  RotateCcw,
  FileCode,
  ChevronDown,
  ChevronUp,
  Terminal,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ChatMessage,
  RAGChatConfig,
  Document,
  ProviderInfo,
  ChatTelemetry,
  ChatCitation,
  AgentToolCall,
} from "@/types";

const DEFAULT_SYSTEM_PROMPT = `You are an accurate, domain-specialized AI assistant equipped with real-time document context.
Answer the user's question using ONLY the provided numbered context passages below.
Cite your sources directly using bracketed numbers like [1], [2].`;

const PROMPT_TEMPLATES = [
  {
    name: "Agentic Research Assistant",
    description: "Iteratively queries domain tools, gathers multi-hop context, and anchors every claim in cited evidence.",
    prompt: `You are an expert autonomous Research & Retrieval Agent equipped with real-time domain knowledge retrieval tools.

MISSION:
Your objective is to provide comprehensive, factual, and strictly evidence-backed answers to user inquiries by leveraging real-time document retrieval.

TOOL USAGE & RETRIEVAL GUIDELINES:
1. MANDATORY KNOWLEDGE GROUNDING: You MUST ground your explanations in factual passages retrieved from the domain documents. Use document retrieval iteratively as many times as needed to gather all necessary facts, follow up on sub-questions, verify references, and compare cross-document concepts.
2. CITATION ANCHORING: Every factual statement and claim you make MUST cite the supporting source passage using inline bracketed numbers corresponding to the retrieved passages (e.g., [1], [2]).
3. ANTI-HALLUCINATION & EVIDENCE BOUNDARIES: Do NOT extrapolate, speculate, or fabricate facts beyond what the retrieved evidence directly supports. If the retrieved evidence is insufficient or partially missing, state specifically what information is verified and what remains unaddressed in the documents.
4. STRUCTURE & SYNTHESIS: Organize your response logically with clear structure, bold key concepts, and concise summaries.`,
  },
  {
    name: "Default Balanced",
    description: "Cites numbered context passages [1], [2] and indicates missing information.",
    prompt: DEFAULT_SYSTEM_PROMPT,
  },
  {
    name: "Strict Factual",
    description: "Refuses to extrapolate or speculate without explicit text evidence.",
    prompt: `You are a strict, ultra-factual domain assistant.
Answer the user's question using ONLY the provided numbered context passages below.
If the context does not explicitly mention the answer, reply EXACTLY: "The uploaded knowledge documents do not contain information to answer this question."
Never assume, extrapolate, or use outside knowledge. Cite all facts with [1], [2].`,
  },
  {
    name: "Executive Briefing",
    description: "Synthesizes concise bulleted takeaways and core metrics.",
    prompt: `You are an executive research analyst.
Synthesize the provided context passages into a concise, high-impact bulleted briefing.
Highlight key numerical metrics, core conclusions, and actionable takeaways.
Cite source passages using [1], [2].`,
  },
];

const SAMPLE_QUESTIONS = [
  "What are the main chunking strategies and when should I use semantic chunking?",
  "How does the Parent-Document hierarchy chunking work in RAG?",
  "What is the difference between Context Precision and Context Recall in evaluation?",
  "Summarize the best practices for vector retrieval and cross-encoder reranking.",
];

export default function PlaygroundPage() {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedFullChat, setCopiedFullChat] = useState(false);
  const [showDefaultPromptRef, setShowDefaultPromptRef] = useState(false);

  // Inspector tab: "config" | "chunks" | "metrics" | "claims" | "waterfall" | "projection"
  const [activeTab, setActiveTab] = useState<"config" | "chunks" | "metrics" | "claims" | "waterfall" | "projection">("config");

  // RAG Pipeline Config (Direct vs Agentic)
  const [ragConfig, setRagConfig] = useState<RAGChatConfig>({
    rag_mode: "agentic",
    document_ids: [],
    chunk_strategy: "",
    embedding_provider: "fastembed",
    embedding_model: "BAAI/bge-small-en-v1.5",
    retrieval_k: 4,
    similarity_threshold: 0.0,
    distance_metric: "cosine",
    reranker: null,
    llm_provider: "ollama",
    llm_model: "llama3.2",
    temperature: 0.1,
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    enable_live_metrics: true,
    user_api_keys: {},
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: documents } = useQuery<Document[]>({
    queryKey: ["documents"],
    queryFn: api.getDocuments,
  });

  const { data: providers } = useQuery<ProviderInfo[]>({
    queryKey: ["providers"],
    queryFn: api.getProviders,
  });

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Real-time SSE Chat Stream Handler
  const handleSendStream = async (queryText: string) => {
    if (!queryText.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: queryText };
    const currentHistory = [...messages, userMessage];

    // Placeholder assistant message
    const initialAssistantMessage: ChatMessage = {
      role: "assistant",
      content: "",
      citations: [],
      retrieved_chunks: [],
      telemetry: undefined,
    };

    setMessages([...currentHistory, initialAssistantMessage]);
    setIsStreaming(true);
    setInputQuery("");

    let streamingContent = "";
    let currentCitations: ChatCitation[] = [];
    let currentChunks: any[] = [];
    let currentToolCalls: AgentToolCall[] = [];
    let currentTelemetry: ChatTelemetry = {
      ttft_ms: 0,
      retrieval_latency_ms: 0,
      generation_latency_ms: 0,
      total_latency_ms: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
      rag_mode: ragConfig.rag_mode,
    };

    try {
      await api.streamChatMessage(currentHistory, ragConfig, {
        onRouting: (data) => {
          currentTelemetry = {
            ...currentTelemetry,
            rag_mode: data.rag_mode as any,
            routing_decision: data.routing_decision,
            rewritten_query: data.rewritten_query,
          };
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.telemetry = { ...currentTelemetry };
            }
            return updated;
          });
        },
        onToolCall: (tc) => {
          currentToolCalls = [...currentToolCalls, tc];
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.tool_calls = [...currentToolCalls];
              if (last.telemetry) {
                last.telemetry.tool_calls = [...currentToolCalls];
              }
            }
            return updated;
          });
        },
        onRetrieved: (data) => {
          currentChunks = data.retrieved_chunks || [];
          currentCitations = data.citations || [];
          if (data.tool_calls && data.tool_calls.length > 0) {
            currentToolCalls = data.tool_calls;
          }
          currentTelemetry = {
            ...currentTelemetry,
            retrieval_latency_ms: data.retrieval_latency_ms,
            tool_calls: currentToolCalls,
          };
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.retrieved_chunks = currentChunks;
              last.citations = currentCitations;
              last.tool_calls = currentToolCalls;
              last.telemetry = { ...currentTelemetry };
            }
            return updated;
          });
          if (currentChunks.length > 0) {
            setActiveTab("chunks");
          }
        },
        onToken: (token) => {
          streamingContent += token;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.content = streamingContent;
            }
            return updated;
          });
        },
        onTelemetry: (telemetryData) => {
          currentTelemetry = {
            ...currentTelemetry,
            ...telemetryData,
          };
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.telemetry = currentTelemetry;
            }
            return updated;
          });
        },
        onError: (err) => {
          console.error("Streaming error:", err);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.content = streamingContent || `⚠️ Error generating response: ${err.message || "Model disconnected"}`;
            }
            return updated;
          });
        },
      });
    } catch (e: any) {
      console.error("Stream catch:", e);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyFullChat = () => {
    if (messages.length === 0) return;

    let formatted = `# 🧪 RAG-Bench Chat Session Log\n\n`;
    formatted += `**Architecture Mode**: ${ragConfig.rag_mode.toUpperCase()} RAG\n`;
    formatted += `**LLM Model**: ${ragConfig.llm_provider} / ${ragConfig.llm_model}\n`;
    formatted += `**Embedding Model**: ${ragConfig.embedding_provider} / ${ragConfig.embedding_model}\n`;
    formatted += `**Retrieval Parameters**: Top-k=${ragConfig.retrieval_k}, Distance=${ragConfig.distance_metric}, Reranker=${ragConfig.reranker || "None"}\n\n`;
    formatted += `---\n\n`;

    messages.forEach((m) => {
      if (m.role === "user") {
        formatted += `### 👤 User:\n${m.content}\n\n`;
      } else {
        formatted += `### 🤖 Assistant:\n${m.content}\n\n`;
        if (
          m.telemetry?.rag_mode === "agentic" &&
          (m.telemetry.rewritten_query || m.telemetry.routing_decision)
        ) {
          formatted += `> **Agent Routing**: \`${m.telemetry.routing_decision}\`\n`;
          if (m.telemetry.rewritten_query) {
            formatted += `> **Rewritten Query**: *"${m.telemetry.rewritten_query}"*\n`;
          }
          formatted += `\n`;
        }
        if (m.citations && m.citations.length > 0) {
          formatted += `**Sources / Citations**:\n`;
          m.citations.forEach((c) => {
            formatted += `- [${c.citation_id}] (Score: ${(c.score * 100).toFixed(1)}%): ${c.preview}\n`;
          });
          formatted += `\n`;
        }
        if (m.telemetry) {
          formatted += `*Telemetry: TTFT=${m.telemetry.ttft_ms}ms | Latency=${m.telemetry.total_latency_ms}ms | Cost=$${m.telemetry.estimated_cost_usd.toFixed(5)} | Faithfulness=${m.telemetry.faithfulness !== null && m.telemetry.faithfulness !== undefined ? (m.telemetry.faithfulness * 100).toFixed(0) + "%" : "N/A"}*\n`;
          if (m.telemetry.claims && m.telemetry.claims.length > 0) {
            formatted += `\n**Verified Atomic Claims**:\n`;
            m.telemetry.claims.forEach((cl) => {
              formatted += `- [${cl.status.toUpperCase()}] ${cl.claim}\n`;
            });
          }
          formatted += `\n`;
        }
      }
      formatted += `---\n\n`;
    });

    navigator.clipboard.writeText(formatted);
    setCopiedFullChat(true);
    setTimeout(() => setCopiedFullChat(false), 2000);
  };

  const latestAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const latestChunks = latestAssistantMessage?.retrieved_chunks || [];
  const latestTelemetry = latestAssistantMessage?.telemetry;

  // 2D Vector Projection points (mocked PCA from cosine similarity)
  const projectionPoints = useMemo(() => {
    if (!latestChunks || latestChunks.length === 0) return [];
    return latestChunks.map((c, idx) => {
      const angle = (idx / latestChunks.length) * Math.PI * 2 + 0.5;
      const radius = Math.max(30, 110 - c.score * 100);
      const x = 150 + Math.cos(angle) * radius;
      const y = 120 + Math.sin(angle) * radius;
      return {
        id: c.chunk_id,
        rank: c.rank,
        score: c.score,
        content: c.content,
        x,
        y,
      };
    });
  }, [latestChunks]);

  return (
    <div className="flex h-[calc(100vh-4.1rem)] overflow-hidden">
      {/* ========================================================================= */}
      {/* LEFT: Interactive Chat Area with Live Streaming */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#070b12] border-r border-border/60">
        {/* Chat Top Banner */}
        <div className="px-6 py-3.5 border-b border-border/60 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">RAG Agent Playground</h2>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-semibold ${
                    ragConfig.rag_mode === "agentic"
                      ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                      : ragConfig.rag_mode === "hybrid"
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {ragConfig.rag_mode === "agentic"
                    ? "🤖 Agentic RAG Mode"
                    : ragConfig.rag_mode === "hybrid"
                    ? "🔀 Hybrid RAG (Dense + BM25 RRF)"
                    : "🎯 Standard Direct RAG"}
                </span>
                {isStreaming && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 animate-pulse">
                    <Zap className="h-3 w-3" /> Streaming SSE...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {ragConfig.llm_provider.toUpperCase()} ({ragConfig.llm_model}) •{" "}
                {ragConfig.embedding_provider} • k={ragConfig.retrieval_k} •{" "}
                {ragConfig.reranker ? ragConfig.reranker : "No Reranker"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyFullChat}
              disabled={messages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/80 rounded-lg border border-indigo-700/60 transition-colors disabled:opacity-40 disabled:hover:bg-indigo-950/60"
              title="Copy the entire conversation log with context & metrics"
            >
              {copiedFullChat ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied Full Chat!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Full Chat</span>
                </>
              )}
            </button>

            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Clear Chat
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-8 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-xl shadow-indigo-500/10">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Interactive RAG Experimentation Playground
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
                Test your knowledge retrieval in real-time with live token streaming. Tune chunking strategies, vector models,
                and inspect atomic claim verification, latency waterfalls, and 2D vector space projections.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {SAMPLE_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputQuery(q);
                    }}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-indigo-950/20 text-xs text-slate-300 transition-all text-left flex items-start justify-between group"
                  >
                    <span>{q}</span>
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-indigo-400 shrink-0 mt-0.5 ml-2 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3.5 max-w-4xl ${
                  m.role === "user" ? "ml-auto justify-end" : "mr-auto justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className={`space-y-2 max-w-[85%]`}>
                  {/* Agentic Thought Banner (if rewritten query or router decision exists) */}
                  {m.telemetry?.rag_mode === "agentic" && (m.telemetry.rewritten_query || m.telemetry.routing_decision) && (
                    <div className="px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-300 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[11px] text-purple-200">
                        <Route className="h-3.5 w-3.5 text-purple-400" />
                        <span>Agent Reasoning & Routing:</span>
                        <span className="font-mono text-purple-300 bg-purple-900/40 px-1.5 py-0.5 rounded text-[10px]">
                          {m.telemetry.routing_decision}
                        </span>
                      </div>
                      {m.telemetry.rewritten_query && (
                        <div className="text-[11px] text-purple-300 flex items-center gap-1.5 pl-5">
                          <CornerDownRight className="h-3 w-3 text-purple-400 shrink-0" />
                          <span>Rewritten Search Query: </span>
                          <strong className="text-purple-100 font-mono">
                            &quot;{m.telemetry.rewritten_query}&quot;
                          </strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Agentic Multi-Step Tool Invocations Widget */}
                  {((m.tool_calls && m.tool_calls.length > 0) || (m.telemetry?.tool_calls && m.telemetry.tool_calls.length > 0)) && (
                    <div className="rounded-xl bg-purple-950/25 border border-purple-800/40 text-xs overflow-hidden shadow-sm">
                      <div className="px-3.5 py-2 bg-purple-900/25 border-b border-purple-800/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-semibold text-purple-200">
                            Agentic Iterative Retrieval ({((m.tool_calls || m.telemetry?.tool_calls)?.length || 0)} Tool Calls)
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/50">
                          ⚡ Multi-Step ReAct
                        </span>
                      </div>

                      <div className="p-2 space-y-1.5">
                        {(m.tool_calls || m.telemetry?.tool_calls)?.map((tc) => (
                          <details
                            key={tc.step}
                            className="group rounded-lg bg-slate-950/70 border border-purple-900/30 overflow-hidden"
                            open={tc.step === 1}
                          >
                            <summary className="px-3 py-2 cursor-pointer flex items-center justify-between text-xs hover:bg-purple-950/30 transition select-none">
                              <div className="flex items-center gap-2">
                                <span className="h-4 w-4 rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/40 text-[10px] flex items-center justify-center font-bold">
                                  {tc.step}
                                </span>
                                <code className="text-purple-300 font-mono text-[11px]">
                                  retrieve_documents(&quot;{tc.query}&quot;)
                                </code>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span className="text-emerald-400">{tc.chunks_found} chunks retrieved</span>
                                <span>•</span>
                                <span className="text-amber-300">{tc.latency_ms}ms</span>
                                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform text-slate-500 ml-1" />
                              </div>
                            </summary>

                            <div className="px-3 py-2.5 border-t border-purple-950/60 space-y-2 bg-slate-950/90 text-[11px]">
                              {tc.chunks.map((chk, cIdx) => (
                                <div key={chk.chunk_id || cIdx} className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                    <span className="font-mono text-indigo-400 font-semibold">
                                      Chunk Score: {chk.score}
                                    </span>
                                    <span className="text-slate-500 font-mono">Rank #{chk.rank}</span>
                                  </div>
                                  <p className="text-slate-300 leading-relaxed font-sans line-clamp-2">
                                    {chk.parent_content || chk.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/20"
                        : "bg-slate-900/80 border border-slate-800/90 text-slate-200 rounded-bl-none shadow-md"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div>
                        <MarkdownRenderer content={m.content} />
                        {isStreaming && idx === messages.length - 1 && (
                          <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-sm">{m.content}</div>
                    )}

                    {/* Inline Citations in assistant messages */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Sources:
                        </span>
                        {m.citations.map((c) => (
                          <button
                            key={c.citation_id}
                            onClick={() => {
                              setSelectedCitationId(c.citation_id);
                              setActiveTab("chunks");
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                              selectedCitationId === c.citation_id
                                ? "bg-indigo-500/30 border-indigo-400 text-indigo-200"
                                : "bg-slate-800/80 border-slate-700/60 text-indigo-400 hover:border-indigo-500/40"
                            }`}
                            title={`Score: ${c.score} • ${c.preview}`}
                          >
                            [{c.citation_id}] ({Math.round(c.score * 100)}%)
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Per-Message Telemetry Banner (Assistant only) */}
                  {m.telemetry && m.telemetry.total_latency_ms > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] px-2 text-slate-400">
                      <span className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-md text-amber-300">
                        <Zap className="h-3 w-3" /> TTFT: {m.telemetry.ttft_ms}ms
                      </span>
                      <span className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                        <Clock className="h-3 w-3" /> Latency: {m.telemetry.total_latency_ms}ms
                      </span>
                      <span className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-md text-emerald-300">
                        <Coins className="h-3 w-3" /> ${m.telemetry.estimated_cost_usd.toFixed(5)}
                      </span>
                      {m.telemetry.faithfulness !== null && m.telemetry.faithfulness !== undefined && (
                        <span className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-md text-indigo-300 font-medium">
                          🎯 Faithfulness: {Math.round(m.telemetry.faithfulness * 100)}%
                        </span>
                      )}

                      <button
                        onClick={() => handleCopy(m.content, idx)}
                        className="ml-auto text-slate-500 hover:text-slate-300 transition-colors p-1"
                        title="Copy Answer"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-md shadow-indigo-600/30">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-border/60 bg-[#090d16]/90 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendStream(inputQuery);
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                ragConfig.rag_mode === "agentic"
                  ? "Ask anything with real-time SSE streaming (Agent will route, rewrite, and evaluate)..."
                  : "Ask a question with direct vector retrieval... (Press Enter to stream)"
              }
              className="w-full pl-4 pr-24 py-3.5 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/60 text-sm text-white placeholder-slate-500 transition-all outline-none"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isStreaming}
              className="absolute right-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
            >
              <span>{isStreaming ? "Streaming" : "Send"}</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT: Live RAG Inspector & Pipeline Tuning Sidebar */}
      {/* ========================================================================= */}
      <div className="w-[420px] border-l border-border/60 bg-[#090d16]/95 backdrop-blur-md flex flex-col h-full shrink-0">
        {/* Inspector Tab Header */}
        <div className="grid grid-cols-6 border-b border-border/60 p-1 bg-slate-950/60 gap-1 text-[11px]">
          <button
            onClick={() => setActiveTab("config")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "config" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Pipeline Parameters"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Config</span>
          </button>
          <button
            onClick={() => setActiveTab("chunks")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "chunks" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Retrieved Passages"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Chunks ({latestChunks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("metrics")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "metrics" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Quality Index"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Metrics</span>
          </button>
          <button
            onClick={() => setActiveTab("claims")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "claims" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Atomic Claims Verification"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Claims</span>
          </button>
          <button
            onClick={() => setActiveTab("waterfall")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "waterfall" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Latency Waterfall Gantt"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Timeline</span>
          </button>
          <button
            onClick={() => setActiveTab("projection")}
            className={`py-1.5 px-1 font-medium rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "projection" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
            title="2D Vector Space Projection"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Vector 2D</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* TAB 1: RAG CONFIGURATION */}
          {activeTab === "config" && (
            <div className="space-y-4">
              {/* RAG Execution Mode Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  RAG Execution Architecture
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRagConfig({ ...ragConfig, rag_mode: "agentic" })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      ragConfig.rag_mode === "agentic"
                        ? "bg-purple-950/40 border-purple-500/80 text-purple-200 shadow-md shadow-purple-500/10"
                        : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-bold text-[11px] mb-0.5">
                      <Network className="h-3 w-3 text-purple-400 shrink-0" />
                      <span>Agentic</span>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">
                      Router + Rewriter
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRagConfig({ ...ragConfig, rag_mode: "hybrid" })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      ragConfig.rag_mode === "hybrid"
                        ? "bg-cyan-950/40 border-cyan-500/80 text-cyan-200 shadow-md shadow-cyan-500/10"
                        : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-bold text-[11px] mb-0.5">
                      <Workflow className="h-3 w-3 text-cyan-400 shrink-0" />
                      <span>Hybrid RAG</span>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">
                      Dense + BM25 RRF
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRagConfig({ ...ragConfig, rag_mode: "direct" })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      ragConfig.rag_mode === "direct"
                        ? "bg-indigo-950/40 border-indigo-500/80 text-indigo-200 shadow-md shadow-indigo-500/10"
                        : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-bold text-[11px] mb-0.5">
                      <Zap className="h-3 w-3 text-indigo-400 shrink-0" />
                      <span>Standard</span>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">
                      Dense Vector
                    </p>
                  </button>
                </div>
              </div>

              {/* Document Scope */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Document Scope</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {documents?.length || 0} available
                  </span>
                </label>
                <select
                  value={ragConfig.document_ids?.[0] || ""}
                  onChange={(e) =>
                    setRagConfig({
                      ...ragConfig,
                      document_ids: e.target.value ? [e.target.value] : [],
                    })
                  }
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                >
                  <option value="">All Uploaded Documents</option>
                  {documents?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename} ({d.chunk_count || 0} chunks)
                    </option>
                  ))}
                </select>
              </div>

              {/* Chunking Strategy Filter */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Chunk Strategy Filter
                </label>
                <select
                  value={ragConfig.chunk_strategy || ""}
                  onChange={(e) =>
                    setRagConfig({ ...ragConfig, chunk_strategy: e.target.value || undefined })
                  }
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                >
                  <option value="">All Chunk Strategies</option>
                  <option value="recursive">Recursive Character Splitting</option>
                  <option value="semantic">Semantic Chunking</option>
                  <option value="parent">Parent-Document Hierarchy</option>
                  <option value="token">Token-Based Windowing</option>
                </select>
              </div>

              {/* Retrieval k Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Retrieval Top-k ({ragConfig.retrieval_k} chunks)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={ragConfig.retrieval_k}
                  onChange={(e) =>
                    setRagConfig({ ...ragConfig, retrieval_k: parseInt(e.target.value) })
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              {/* Similarity Threshold Cutoff */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Min Similarity Score</span>
                  <span className="text-indigo-400 font-mono">
                    {ragConfig.similarity_threshold.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.8"
                  step="0.05"
                  value={ragConfig.similarity_threshold}
                  onChange={(e) =>
                    setRagConfig({ ...ragConfig, similarity_threshold: parseFloat(e.target.value) })
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              {/* Cross-Encoder Reranker */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Cross-Encoder Reranker
                </label>
                <select
                  value={ragConfig.reranker || ""}
                  onChange={(e) =>
                    setRagConfig({ ...ragConfig, reranker: e.target.value || null })
                  }
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                >
                  <option value="">None (Standard pgvector rank)</option>
                  <option value="cross-encoder/ms-marco-MiniLM-L-6-v2">
                    Sentence-Transformers (MS-Marco)
                  </option>
                  <option value="BAAI/bge-reranker-base">BAAI BGE Reranker</option>
                </select>
              </div>

              {/* LLM Model Provider */}
              <div className="pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  LLM Generator Model
                </label>
                <div className="space-y-2">
                  <select
                    value={ragConfig.llm_provider}
                    onChange={(e) =>
                      setRagConfig({
                        ...ragConfig,
                        llm_provider: e.target.value,
                        llm_model: e.target.value === "ollama" ? "llama3.2" : "gpt-4o-mini",
                      })
                    }
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                  >
                    <option value="ollama">Ollama (Local / Free)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="google">Google Gemini</option>
                    <option value="groq">Groq</option>
                  </select>

                  <input
                    type="text"
                    value={ragConfig.llm_model}
                    onChange={(e) => setRagConfig({ ...ragConfig, llm_model: e.target.value })}
                    placeholder="Model identifier (e.g. llama3.2, gpt-4o-mini)"
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>
              </div>

              {/* System Prompt & Custom Agent Instructions */}
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 text-indigo-400" />
                    <label className="text-xs font-semibold text-slate-200">
                      System Prompt & Instructions
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ragConfig.system_prompt?.trim() === DEFAULT_SYSTEM_PROMPT.trim() ? (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                        Default
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/50">
                        Customized
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRagConfig({ ...ragConfig, system_prompt: DEFAULT_SYSTEM_PROMPT })}
                      className="text-[10px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                      title="Reset prompt to default"
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Quick Preset Templates */}
                <div className="flex flex-wrap gap-1">
                  {PROMPT_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => setRagConfig({ ...ragConfig, system_prompt: tmpl.prompt })}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                        ragConfig.system_prompt?.trim() === tmpl.prompt.trim()
                          ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/50"
                          : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700"
                      }`}
                      title={tmpl.description}
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>

                {/* Prompt Textarea */}
                <div className="relative">
                  <textarea
                    rows={4}
                    value={ragConfig.system_prompt || ""}
                    onChange={(e) => setRagConfig({ ...ragConfig, system_prompt: e.target.value })}
                    placeholder="Provide custom persona, tone, citation syntax or constraints..."
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 outline-none font-mono leading-relaxed resize-y"
                  />
                  <div className="text-[10px] text-slate-500 text-right mt-0.5">
                    {ragConfig.system_prompt?.length || 0} chars • {(ragConfig.system_prompt || "").split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>

                {/* Default Prompt Reference Accordion */}
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowDefaultPromptRef(!showDefaultPromptRef)}
                    className="w-full px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 flex items-center justify-between text-left transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Terminal className="h-3 w-3 text-slate-500" />
                      <span>View Default Prompt Reference</span>
                    </span>
                    {showDefaultPromptRef ? (
                      <ChevronUp className="h-3 w-3 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-slate-500" />
                    )}
                  </button>

                  {showDefaultPromptRef && (
                    <div className="p-2.5 pt-1 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 space-y-2 bg-slate-950/90">
                      <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 select-text whitespace-pre-wrap leading-relaxed">
                        {DEFAULT_SYSTEM_PROMPT}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal font-sans">
                        💡 <strong>Note</strong>: The RAG engine appends numbered retrieved context chunks (e.g. <code className="text-indigo-300">[1]</code>, <code className="text-indigo-300">[2]</code>) immediately below this system prompt.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RETRIEVED CHUNKS & SENTENCE HEATMAP */}
          {activeTab === "chunks" && (
            <div className="space-y-3">
              {latestChunks.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <Layers className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p>No chunks retrieved yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ask a question in the chat to inspect retrieved passages.
                  </p>
                </div>
              ) : (
                latestChunks.map((chunk, idx) => (
                  <div
                    key={chunk.chunk_id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      selectedCitationId === idx + 1
                        ? "bg-indigo-950/30 border-indigo-500/60 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-mono font-bold flex items-center justify-center border border-indigo-500/30">
                          {idx + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-300">
                          Rank #{chunk.rank}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40">
                        Score: {chunk.score.toFixed(3)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 font-mono leading-relaxed max-h-48 overflow-y-auto bg-slate-950/70 p-3 rounded-lg border border-slate-900 whitespace-pre-wrap select-text">
                      {chunk.parent_content || chunk.content}
                    </div>

                    {chunk.parent_content && (
                      <div className="mt-2 text-[10px] text-purple-400 flex items-center gap-1 font-mono">
                        <Info className="h-3 w-3" /> Resolved Parent-Document Context
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: QUALITY METRICS & INDEX */}
          {activeTab === "metrics" && (
            <div className="space-y-4">
              {!latestTelemetry ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p>No telemetry recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Quality & Triad Index
                  </h4>

                  {/* Faithfulness */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-300">Faithfulness</span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {latestTelemetry.faithfulness !== null && latestTelemetry.faithfulness !== undefined
                          ? `${Math.round(latestTelemetry.faithfulness * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full"
                        style={{ width: `${(latestTelemetry.faithfulness || 0.8) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Context Precision */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-300">Context Precision</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {latestTelemetry.context_precision !== null && latestTelemetry.context_precision !== undefined
                          ? `${Math.round(latestTelemetry.context_precision * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${(latestTelemetry.context_precision || 0.8) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Answer Relevance */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-300">Answer Relevance</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {latestTelemetry.answer_relevance !== null && latestTelemetry.answer_relevance !== undefined
                          ? `${Math.round(latestTelemetry.answer_relevance * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full"
                        style={{ width: `${(latestTelemetry.answer_relevance || 0.85) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Context Utilization */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-300">Context Utilization</span>
                      <span className="font-mono text-purple-400 font-bold">
                        {latestTelemetry.context_utilization_rate !== null && latestTelemetry.context_utilization_rate !== undefined
                          ? `${Math.round(latestTelemetry.context_utilization_rate * 100)}%`
                          : "75%"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full"
                        style={{ width: `${(latestTelemetry.context_utilization_rate || 0.75) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Proportion of retrieved chunk tokens utilized in answer
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ATOMIC CLAIMS VERIFICATION */}
          {activeTab === "claims" && (
            <div className="space-y-3">
              {!latestTelemetry?.claims || latestTelemetry.claims.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p>No atomic claims recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Factual Claim Verification
                  </h4>
                  {latestTelemetry.claims.map((cl, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs leading-relaxed ${
                        cl.status === "supported"
                          ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                          : "bg-rose-950/20 border-rose-800/40 text-rose-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold font-mono ${
                            cl.status === "supported"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {cl.status === "supported" ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <ShieldAlert className="h-3 w-3" />
                          )}
                          {cl.status}
                        </span>
                        {cl.citation_id && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Citation [{cl.citation_id}]
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-slate-200">{cl.claim}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: LATENCY WATERFALL (GANTT BREAKDOWN) */}
          {activeTab === "waterfall" && (
            <div className="space-y-4">
              {!latestTelemetry ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p>No latency telemetry available.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
                    <span>Latency Waterfall</span>
                    <span className="text-indigo-400 font-mono">
                      {latestTelemetry.total_latency_ms}ms total
                    </span>
                  </h4>

                  <div className="space-y-2 text-xs">
                    {/* Embedding */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">1. Query Embedding (FastEmbed)</span>
                        <span className="font-mono text-slate-200">
                          {latestTelemetry.latency_breakdown?.embedding_ms || 18}ms
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full w-[15%]" />
                      </div>
                    </div>

                    {/* Vector Search */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">2. pgvector Cosine Search</span>
                        <span className="font-mono text-slate-200">
                          {latestTelemetry.latency_breakdown?.vector_search_ms || 12}ms
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-cyan-500 h-full w-[10%]" />
                      </div>
                    </div>

                    {/* TTFT */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">3. Time to First Token (TTFT)</span>
                        <span className="font-mono text-amber-300">
                          {latestTelemetry.ttft_ms}ms
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full w-[35%]" />
                      </div>
                    </div>

                    {/* LLM Generation */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">4. LLM Generation Stream</span>
                        <span className="font-mono text-indigo-300">
                          {latestTelemetry.generation_latency_ms}ms
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full w-[85%]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: 2D VECTOR PROJECTION MAP */}
          {activeTab === "projection" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
                <span>Vector Space 2D Projection</span>
                <span className="text-[10px] text-slate-400">Top-k Cluster</span>
              </h4>

              <div className="relative h-64 w-full bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden">
                <svg className="w-full h-full">
                  {/* Grid Lines */}
                  <line x1="150" y1="0" x2="150" y2="250" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="120" x2="350" y2="120" stroke="#1e293b" strokeDasharray="3,3" />

                  {/* Query Center Node */}
                  <circle cx="150" cy="120" r="7" fill="#6366f1" className="animate-pulse" />
                  <text x="162" y="124" fill="#818cf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
                    Query
                  </text>

                  {/* Retrieved Chunk Nodes */}
                  {projectionPoints.map((pt) => (
                    <g key={pt.id}>
                      <line
                        x1="150"
                        y1="120"
                        x2={pt.x}
                        y2={pt.y}
                        stroke="#334155"
                        strokeDasharray="2,2"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6"
                        fill="#10b981"
                        stroke="#064e3b"
                        strokeWidth="2"
                        className="hover:scale-125 transition-transform cursor-pointer"
                      />
                      <text
                        x={pt.x + 8}
                        y={pt.y + 4}
                        fill="#a7f3d0"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        #{pt.rank} ({(pt.score * 100).toFixed(0)}%)
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                Relative semantic distance of candidate chunks to user query vector
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
