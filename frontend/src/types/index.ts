export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
  status: "pending" | "processing" | "ready" | "failed";
  page_count: number | null;
  doc_metadata: Record<string, any> | null;
  chunk_count?: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  chunk_index: number;
  chunk_strategy: string;
  content: string;
  token_count: number | null;
  embedding_model: string | null;
  embedding_provider: string | null;
  parent_chunk_id: string | null;
  chunk_metadata: Record<string, any> | null;
  created_at: string;
}

export interface TestCase {
  id: string;
  dataset_id: string;
  question: string;
  ground_truth_answer: string;
  expected_context: string | null;
  question_type: "single_hop" | "multi_hop" | "adversarial";
  is_verified: boolean;
  created_at: string;
}

export interface TestDataset {
  id: string;
  document_id: string | null;
  name: string;
  description: string | null;
  test_cases_count: number;
  created_at: string;
}

export interface MatrixConfig {
  chunking_strategies: Array<{
    type: "recursive" | "semantic" | "parent_document" | "token_window";
    chunk_size?: number;
    chunk_overlap?: number;
    threshold?: number;
    parent_chunk_size?: number;
    child_chunk_size?: number;
  }>;
  embedding_models: string[];
  embedding_providers: string[];
  retrieval_k: number[];
  distance_metrics: string[];
  rerankers: (string | null)[];
  llm_models: string[];
  llm_providers: string[];
  user_api_keys: Record<string, string>;
}

export interface ExperimentRun {
  id: string;
  dataset_id: string | null;
  name: string | null;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  pipeline_config: Record<string, any>;
  total_test_cases: number | null;
  completed_cases: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  avg_context_precision?: number | null;
  avg_context_recall?: number | null;
  avg_faithfulness?: number | null;
  avg_answer_relevance?: number | null;
  avg_latency_ms?: number | null;
  total_cost_usd?: number | null;
}

export interface EvaluationResult {
  id: string;
  test_case_id: string;
  question?: string | null;
  ground_truth_answer?: string | null;
  question_type?: "single_hop" | "multi_hop" | "adversarial" | string | null;
  generated_answer: string | null;
  retrieved_chunks_json: Array<{
    chunk_id: string;
    content: string;
    score: number;
    rank: number;
    parent_content?: string | null;
  }> | null;
  context_precision: number | null;
  context_recall: number | null;
  faithfulness: number | null;
  answer_relevance: number | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  retrieval_latency_ms: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  error_message: string | null;
  created_at: string;
}

export interface MetricAverages {
  context_precision: number;
  context_recall: number;
  faithfulness: number;
  answer_relevance: number;
  avg_latency_ms: number;
  avg_ttft_ms: number;
  total_cost_usd: number;
  total_tokens: number;
}

export interface TestCaseComparison {
  test_case_id: string;
  question: string;
  ground_truth_answer: string;
  run_a_answer: string | null;
  run_b_answer: string | null;
  run_a_precision: number | null;
  run_b_precision: number | null;
  run_a_recall: number | null;
  run_b_recall: number | null;
  run_a_faithfulness: number | null;
  run_b_faithfulness: number | null;
  run_a_relevance: number | null;
  run_b_relevance: number | null;
  run_a_latency_ms: number | null;
  run_b_latency_ms: number | null;
  run_a_chunks: any[] | null;
  run_b_chunks: any[] | null;
}

export interface RunComparisonResponse {
  run_a: ExperimentRun;
  run_b: ExperimentRun;
  metrics_a: MetricAverages;
  metrics_b: MetricAverages;
  diffs: Record<string, number>;
  test_case_comparisons: TestCaseComparison[];
}

export interface TradeOffPoint {
  run_id: string;
  run_name: string;
  config_label: string;
  context_precision: number;
  context_recall: number;
  faithfulness: number;
  answer_relevance: number;
  latency_ms: number;
  cost_usd: number;
}

export interface FailureAnalysisItem {
  result_id: string;
  run_id: string;
  test_case_id: string;
  question: string;
  ground_truth_answer: string;
  generated_answer: string | null;
  failure_type: "hallucination" | "low_recall" | "low_precision" | "high_latency";
  score: number;
  retrieved_chunks: any[] | null;
}

export interface ProviderInfo {
  provider: string;
  name: string;
  type: "cloud" | "local";
  chat_models: string[];
  embedding_models: string[];
  requires_api_key: boolean;
  is_configured: boolean;
}

export interface ChatCitation {
  citation_id: number;
  chunk_id: string;
  score: number;
  preview: string;
}

export interface AtomicClaim {
  claim: string;
  status: "supported" | "unsupported" | "partially_supported";
  citation_id?: number | null;
  source_snippet?: string | null;
}

export interface LatencyBreakdown {
  embedding_ms: number;
  vector_search_ms: number;
  reranking_ms: number;
  ttft_ms: number;
  generation_ms: number;
  total_ms: number;
}

export interface AgentToolCall {
  step: number;
  tool_name: string;
  query: string;
  rationale?: string | null;
  latency_ms: number;
  chunks_found: number;
  chunks: Array<{
    chunk_id: string;
    content: string;
    score: number;
    rank: number;
    parent_content?: string | null;
    metadata?: Record<string, any>;
  }>;
}

export interface ChatTelemetry {
  ttft_ms: number;
  retrieval_latency_ms: number;
  generation_latency_ms: number;
  total_latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  rag_mode?: "direct" | "agentic" | "hybrid";
  rewritten_query?: string | null;
  routing_decision?: string | null;
  faithfulness?: number | null;
  context_precision?: number | null;
  answer_relevance?: number | null;
  context_utilization_rate?: number | null;
  context_noise_ratio?: number | null;
  answer_completeness?: number | null;
  claims?: AtomicClaim[];
  tool_calls?: AgentToolCall[];
  latency_breakdown?: LatencyBreakdown | null;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: ChatCitation[];
  telemetry?: ChatTelemetry;
  tool_calls?: AgentToolCall[];
  retrieved_chunks?: Array<{
    chunk_id: string;
    content: string;
    score: number;
    rank: number;
    parent_content?: string | null;
    metadata?: Record<string, any>;
  }>;
}

export interface RAGChatConfig {
  rag_mode: "direct" | "agentic" | "hybrid";
  document_ids?: string[];
  chunk_strategy?: string;
  embedding_provider: string;
  embedding_model: string;
  retrieval_k: number;
  similarity_threshold: number;
  distance_metric: string;
  reranker?: string | null;
  llm_provider: string;
  llm_model: string;
  temperature: number;
  system_prompt?: string;
  enable_live_metrics: boolean;
  user_api_keys?: Record<string, string>;
}

export interface ChatResponse {
  role: "assistant";
  content: string;
  citations: ChatCitation[];
  retrieved_chunks: Array<{
    chunk_id: string;
    content: string;
    score: number;
    rank: number;
    parent_content?: string | null;
    metadata?: Record<string, any>;
  }>;
  telemetry: ChatTelemetry;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: "ollama" | "fastembed" | "openai" | "anthropic" | "cohere" | "google";
  type: "llm" | "embedding" | "reranker";
  is_downloaded: boolean;
  size_bytes?: number | null;
  size_formatted?: string | null;
  ram_required?: string | null;
  description?: string | null;
  modified_at?: string | null;
  parameter_size?: string | null;
  quantization?: string | null;
}

export interface ModelPullProgress {
  model_name: string;
  status: string;
  digest?: string | null;
  total?: number | null;
  completed?: number | null;
  percentage?: number | null;
  speed_formatted?: string | null;
  error?: string | null;
}

