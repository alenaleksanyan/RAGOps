"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ModelInfo, TestCase, TestDataset } from "@/types";
import { useAppStore } from "@/lib/store";
import { ModelDownloadModal } from "@/components/ModelDownloadModal";
import {
  Check,
  CheckCircle2,
  Download,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
  UploadCloud,
  Scale,
  ShieldCheck,
  ShieldAlert,
  Filter,
  CheckSquare,
  Award,
  BarChart3,
  FileSpreadsheet,
  FileCode,
  AlertCircle,
  Database,
  RefreshCw,
  Layers,
} from "lucide-react";

export default function BenchmarksPage() {
  const queryClient = useQueryClient();
  const { userApiKeys } = useAppStore();

  // Navigation tab: 'curation' | 'calibration' | 'import_generate'
  const [activeTab, setActiveTab] = useState<"curation" | "calibration" | "import_generate">("curation");

  // Selected Dataset
  const [selectedDataset, setSelectedDataset] = useState<TestDataset | null>(null);

  // Curation State
  const [filterStatus, setFilterStatus] = useState<"all" | "unverified" | "verified">("all");
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TestCase>>({});
  const [isAddingCase, setIsAddingCase] = useState<boolean>(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newGroundTruth, setNewGroundTruth] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<"single_hop" | "multi_hop">("single_hop");

  // Judge Calibration State
  const [judgeModel, setJudgeModel] = useState<string>("llama3.2");
  const [calibrateSampleSize, setCalibrateSampleSize] = useState<string>("all");
  const [calibrationResults, setCalibrationResults] = useState<any | null>(null);

  // Import & Generator State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importName, setImportName] = useState<string>("");
  const [importDesc, setImportDesc] = useState<string>("");
  const [importDocId, setImportDocId] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [defaultVerified, setDefaultVerified] = useState<boolean>(true);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState<boolean>(false);
  const [customJsonPath, setCustomJsonPath] = useState<string>("");
  const [customQuestionCol, setCustomQuestionCol] = useState<string>("");
  const [customAnswerCol, setCustomAnswerCol] = useState<string>("");
  const [customContextCol, setCustomContextCol] = useState<string>("");
  const [customVerifiedCol, setCustomVerifiedCol] = useState<string>("");

  const [genDocId, setGenDocId] = useState<string>("");
  const [genName, setGenName] = useState<string>("");
  const [genNumQuestions, setGenNumQuestions] = useState<number>(5);
  const [genModel, setGenModel] = useState<string>("llama3.2");

  // Pre-flight Model Download modal (only for pulling local models)
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [modelsToDownload, setModelsToDownload] = useState<ModelInfo[]>([]);

  // Queries
  const { data: allModels } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.getModels(),
    refetchInterval: 10000,
  });

  const modelMap = useMemo(() => {
    const map = new Map<string, ModelInfo>();
    if (allModels) {
      for (const m of allModels) {
        map.set(m.name, m);
      }
    }
    return map;
  }, [allModels]);

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: api.getDocuments,
  });

  const { data: datasets, isLoading: loadingDatasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => {
      const list = await api.getDatasets();
      if (list.length > 0 && !selectedDataset) {
        setSelectedDataset(list[0]);
      }
      return list;
    },
  });

  const activeDatasetId = selectedDataset?.id || (datasets && datasets[0]?.id);

  const { data: testCases, isLoading: loadingCases } = useQuery({
    queryKey: ["test-cases", activeDatasetId],
    queryFn: () => (activeDatasetId ? api.getTestCases(activeDatasetId) : []),
    enabled: !!activeDatasetId,
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (payload: {
      document_id: string;
      name?: string;
      num_questions: number;
      provider: string;
      model_name: string;
    }) => api.generateSyntheticDataset(payload),
    onSuccess: (newDataset) => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setSelectedDataset(newDataset);
      setActiveTab("curation");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error("Please select a JSON or CSV file to import.");
      const formData = new FormData();
      formData.append("file", importFile);
      if (importName.trim()) formData.append("name", importName.trim());
      if (importDesc.trim()) formData.append("description", importDesc.trim());
      if (importDocId) formData.append("document_id", importDocId);
      if (customJsonPath.trim()) formData.append("json_root_path", customJsonPath.trim());
      formData.append("default_verified", String(defaultVerified));

      if (customQuestionCol.trim() && customAnswerCol.trim()) {
        formData.append(
          "field_mapping",
          JSON.stringify({
            question: customQuestionCol.trim(),
            answer: customAnswerCol.trim(),
            context: customContextCol.trim() || undefined,
            is_verified: customVerifiedCol.trim() || undefined,
          })
        );
      }

      return api.importDataset(formData);
    },
    onSuccess: (newDataset) => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setSelectedDataset(newDataset);
      setImportFile(null);
      setImportName("");
      setImportDesc("");
      setImportDocId("");
      setImportError(null);
      setShowAdvancedMapping(false);
      setCustomJsonPath("");
      setCustomQuestionCol("");
      setCustomAnswerCol("");
      setCustomContextCol("");
      setCustomVerifiedCol("");
      setActiveTab("curation");
    },
    onError: (err: any) => {
      setImportError(err.message || "Failed to import dataset.");
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: Partial<TestCase> }) =>
      api.updateTestCase(activeDatasetId!, caseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeDatasetId] });
      setEditingCaseId(null);
      setEditDraft({});
    },
  });

  const batchVerifyMutation = useMutation({
    mutationFn: ({ isVerified }: { isVerified: boolean }) =>
      api.batchVerifyTestCases(activeDatasetId!, [], isVerified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeDatasetId] });
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (data: Partial<TestCase>) => api.createTestCase(activeDatasetId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeDatasetId] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setIsAddingCase(false);
      setNewQuestion("");
      setNewGroundTruth("");
      setNewContext("");
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (caseId: string) => api.deleteTestCase(activeDatasetId!, caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeDatasetId] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  const calibrateMutation = useMutation({
    mutationFn: async () => {
      const isCloud =
        judgeModel.includes("gpt") || judgeModel.includes("claude") || judgeModel.includes("gemini");
      const provider = judgeModel.includes("claude")
        ? "anthropic"
        : judgeModel.includes("gemini")
        ? "google"
        : judgeModel.includes("gpt")
        ? "openai"
        : "ollama";

      const apiKey = userApiKeys[provider];
      const limit =
        calibrateSampleSize === "all" ? undefined : parseInt(calibrateSampleSize, 10);

      return api.calibrateJudge(activeDatasetId!, {
        provider,
        model_name: judgeModel,
        api_key: apiKey,
        limit,
      });
    },
    onSuccess: (data) => {
      setCalibrationResults(data);
    },
  });

  const handleExportJSON = () => {
    if (!testCases || !selectedDataset) return;
    const jsonStr = JSON.stringify(testCases, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedDataset.name.replace(/\s+/g, "_")}_benchmark.json`;
    a.click();
  };

  const totalCases = testCases?.length || 0;
  const verifiedCases = testCases?.filter((c) => c.is_verified).length || 0;
  const unverifiedCases = totalCases - verifiedCases;
  const verificationPercent = totalCases > 0 ? Math.round((verifiedCases / totalCases) * 100) : 0;

  const filteredCases = useMemo(() => {
    if (!testCases) return [];
    if (filterStatus === "verified") return testCases.filter((c) => c.is_verified);
    if (filterStatus === "unverified") return testCases.filter((c) => !c.is_verified);
    return testCases;
  }, [testCases, filterStatus]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Integrated View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Ground-Truth Benchmark Studio</h2>
          <p className="text-xs text-slate-400 mt-1">
            Import datasets, curate human gold standards inline, and meta-evaluate automated LLM judges.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab("curation")}
            className={`px-4 py-2 rounded-xl font-semibold transition flex items-center gap-2 ${
              activeTab === "curation"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Test Cases ({totalCases})</span>
          </button>

          <button
            onClick={() => setActiveTab("calibration")}
            className={`px-4 py-2 rounded-xl font-semibold transition flex items-center gap-2 ${
              activeTab === "calibration"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Judge Calibration</span>
          </button>

          <button
            onClick={() => setActiveTab("import_generate")}
            className={`px-4 py-2 rounded-xl font-semibold transition flex items-center gap-2 ${
              activeTab === "import_generate"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import & Synthetic QA</span>
          </button>
        </div>
      </div>

      {/* Dataset Selector Horizontal Pills */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2 overflow-x-auto">
          {datasets?.map((ds) => (
            <button
              key={ds.id}
              onClick={() => {
                setSelectedDataset(ds);
                setEditingCaseId(null);
                setCalibrationResults(null);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                selectedDataset?.id === ds.id
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {ds.name} ({ds.test_cases_count || 0} Qs)
            </button>
          ))}
        </div>

        <button
          onClick={handleExportJSON}
          disabled={!testCases || testCases.length === 0}
          className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium inline-flex items-center space-x-1.5 disabled:opacity-40 shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export JSON</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TEST CASES & HUMAN LABELING STUDIO (IN-PAGE)                       */}
      {/* ========================================================================= */}
      {activeTab === "curation" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Curation Toolbar */}
          {selectedDataset && (
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Verification Progress Bar */}
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Human-in-the-Loop Gold Standard</span>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      {verifiedCases} / {totalCases} Verified ({verificationPercent}%)
                    </span>
                  </div>
                  <div className="w-60 h-2 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${verificationPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Filters & Action Buttons */}
              <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      filterStatus === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All ({totalCases})
                  </button>
                  <button
                    onClick={() => setFilterStatus("unverified")}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      filterStatus === "unverified"
                        ? "bg-slate-800 text-amber-300"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Needs Review ({unverifiedCases})
                  </button>
                  <button
                    onClick={() => setFilterStatus("verified")}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      filterStatus === "verified"
                        ? "bg-slate-800 text-emerald-300"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Verified ({verifiedCases})
                  </button>
                </div>

                <button
                  onClick={() => batchVerifyMutation.mutate({ isVerified: true })}
                  disabled={batchVerifyMutation.isPending || totalCases === 0}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Verify All</span>
                </button>

                <button
                  onClick={() => setIsAddingCase(!isAddingCase)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>
          )}

          {/* Inline Add Test Case Form Card */}
          {isAddingCase && (
            <div className="glass-panel p-6 rounded-2xl border-2 border-indigo-500/50 bg-slate-950/80 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-bold text-white">Create New Test Case</h4>
                </div>
                <button
                  onClick={() => setIsAddingCase(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1.5 font-semibold">Question / Search Query</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. What is the maximum throughput supported by the architecture?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-indigo-500 font-normal"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1.5 font-semibold">Ground-Truth Reference Answer</label>
                  <textarea
                    rows={4}
                    placeholder="e.g. The maximum throughput is 10,000 queries per second under dual-node clustering."
                    value={newGroundTruth}
                    onChange={(e) => setNewGroundTruth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-indigo-500 font-normal"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 block mb-1.5 font-semibold">
                      Reference Context Passage (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Optional citation passage proving the answer"
                      value={newContext}
                      onChange={(e) => setNewContext(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-slate-300 block mb-1.5 font-semibold">Question Complexity Type</label>
                      <select
                        value={newQuestionType}
                        onChange={(e) => setNewQuestionType(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500"
                      >
                        <option value="single_hop">Single-Hop (Direct Fact Lookup)</option>
                        <option value="multi_hop">Multi-Hop (Multi-Passage Reasoning)</option>
                      </select>
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsAddingCase(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!newQuestion.trim() || !newGroundTruth.trim() || createCaseMutation.isPending}
                        onClick={() =>
                          createCaseMutation.mutate({
                            question: newQuestion.trim(),
                            ground_truth_answer: newGroundTruth.trim(),
                            expected_context: newContext.trim() || undefined,
                            question_type: newQuestionType,
                            is_verified: true,
                          })
                        }
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Save Verified Test Case</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Test Cases List */}
          <div className="space-y-4">
            {loadingCases ? (
              <div className="flex items-center justify-center py-16 text-slate-400 space-x-2">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                <span className="text-xs">Loading benchmark test cases...</span>
              </div>
            ) : filteredCases.length > 0 ? (
              filteredCases.map((tc, idx) => {
                const isEditing = editingCaseId === tc.id;

                if (isEditing) {
                  return (
                    <div
                      key={tc.id}
                      className="glass-panel p-6 rounded-2xl border-2 border-indigo-500/60 bg-slate-900/90 space-y-4 animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <span className="text-xs font-bold text-indigo-400 font-mono">
                          Editing Question #{idx + 1}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCaseId(null);
                            setEditDraft({});
                          }}
                          className="text-slate-400 hover:text-white p-1 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3.5 text-xs">
                        <div>
                          <label className="text-slate-300 block mb-1 font-semibold">Question</label>
                          <textarea
                            rows={2}
                            value={editDraft.question ?? tc.question}
                            onChange={(e) => setEditDraft({ ...editDraft, question: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white font-normal"
                          />
                        </div>

                        <div>
                          <label className="text-slate-300 block mb-1 font-semibold">
                            Ground-Truth Reference Answer
                          </label>
                          <textarea
                            rows={4}
                            value={editDraft.ground_truth_answer ?? tc.ground_truth_answer}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, ground_truth_answer: e.target.value })
                            }
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white font-normal"
                          />
                        </div>

                        <div>
                          <label className="text-slate-300 block mb-1 font-semibold">
                            Reference Context Passage (Optional)
                          </label>
                          <textarea
                            rows={3}
                            value={editDraft.expected_context ?? (tc.expected_context || "")}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, expected_context: e.target.value })
                            }
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 font-mono"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editDraft.is_verified ?? tc.is_verified}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, is_verified: e.target.checked })
                              }
                              className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-4 h-4"
                            />
                            <span className="text-xs font-semibold text-slate-300">
                              Mark as Human-Verified Gold Standard
                            </span>
                          </label>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCaseId(null);
                                setEditDraft({});
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() =>
                                updateCaseMutation.mutate({
                                  caseId: tc.id,
                                  data: {
                                    question: editDraft.question ?? tc.question,
                                    ground_truth_answer:
                                      editDraft.ground_truth_answer ?? tc.ground_truth_answer,
                                    expected_context:
                                      editDraft.expected_context !== undefined
                                        ? editDraft.expected_context
                                        : tc.expected_context,
                                    is_verified: editDraft.is_verified ?? tc.is_verified,
                                  },
                                })
                              }
                              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5"
                            >
                              <Check className="w-4 h-4" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tc.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      tc.is_verified
                        ? "bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/50"
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2.5 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-indigo-400 font-mono">
                            Q{idx + 1}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 uppercase font-semibold">
                            {tc.question_type}
                          </span>
                          {tc.is_verified ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateCaseMutation.mutate({
                                  caseId: tc.id,
                                  data: { is_verified: false },
                                })
                              }
                              className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 font-semibold flex items-center gap-1 transition"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Verified Ground Truth
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateCaseMutation.mutate({
                                  caseId: tc.id,
                                  data: { is_verified: true },
                                })
                              }
                              className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 hover:bg-emerald-500/20 text-amber-300 hover:text-emerald-300 border border-amber-500/30 hover:border-emerald-500/40 font-semibold flex items-center gap-1 transition"
                            >
                              <ShieldAlert className="h-3 w-3" /> Click to Verify (Review Needed)
                            </button>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-white leading-relaxed">{tc.question}</div>
                        <div className="text-xs text-slate-300 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 leading-relaxed">
                          <strong className="text-slate-400 block mb-1 text-[11px] font-semibold uppercase tracking-wider">
                            Ground-Truth Reference:
                          </strong>
                          {tc.ground_truth_answer}
                        </div>
                        {tc.expected_context && (
                          <div className="text-[11px] text-slate-400 font-mono bg-slate-950/40 p-2.5 rounded-xl border border-slate-900 leading-relaxed">
                            <strong className="text-slate-500 block mb-0.5">Reference Passage:</strong>
                            {tc.expected_context}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setEditingCaseId(tc.id);
                            setEditDraft(tc);
                          }}
                          className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                          title="Edit Inline"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteCaseMutation.mutate(tc.id)}
                          className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                          title="Delete Case"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="glass-panel p-12 text-center text-slate-400 text-xs rounded-2xl border border-slate-800">
                No test cases found in this filter. Switch to the <strong>Import & Synthetic QA</strong> tab to create questions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INTEGRATED LLM-AS-A-JUDGE CALIBRATION STUDIO                        */}
      {/* ========================================================================= */}
      {activeTab === "calibration" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Target Dataset Banner */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Scale className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">LLM-as-a-Judge Calibration Studio</h3>
                <p className="text-xs text-slate-400">
                  Benchmarking evaluator models against dataset: <strong className="text-white">{selectedDataset?.name}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-emerald-400 bg-emerald-950/50 px-3.5 py-1.5 rounded-xl border border-emerald-800/60 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{verifiedCases} Human-Verified Cases</span>
            </div>
          </div>

          {/* Model Selector & Run Control Card */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Select Candidate Evaluator Judge Model
                </label>
                <select
                  value={judgeModel}
                  onChange={(e) => setJudgeModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="llama3.2">Ollama: llama3.2 (Local 3B Judge)</option>
                  <option value="llama3.1:8b">Ollama: llama3.1:8b (Local 8B Judge)</option>
                  <option value="mistral:7b">Ollama: mistral:7b (Local 7B Judge)</option>
                  <option value="qwen2.5:7b">Ollama: qwen2.5:7b (Local 7B Judge)</option>
                  <option value="gpt-4o-mini">OpenAI: gpt-4o-mini (Cloud Benchmark Judge)</option>
                  <option value="gpt-4o">OpenAI: gpt-4o (State of the Art Frontier Judge)</option>
                  <option value="claude-3-5-sonnet-20241022">Anthropic: Claude 3.5 Sonnet</option>
                  <option value="gemini-1.5-flash">Google: Gemini 1.5 Flash</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Evaluation Sample Size
                </label>
                <select
                  value={calibrateSampleSize}
                  onChange={(e) => setCalibrateSampleSize(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="all">All Verified Questions ({verifiedCases || totalCases})</option>
                  <option value="5">5 Questions (Fast Probe)</option>
                  <option value="10">10 Questions (Standard)</option>
                  <option value="20">20 Questions</option>
                  <option value="30">30 Questions</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  disabled={calibrateMutation.isPending || verifiedCases === 0}
                  onClick={() => calibrateMutation.mutate()}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2"
                >
                  {calibrateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Evaluating Judge...</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>Run Judge Calibration</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {verifiedCases === 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>You need at least 1 human-verified test case in this dataset to run Judge Calibration.</span>
              </div>
            )}
          </div>

          {/* Results Scoreboard & Justification Cards */}
          {calibrationResults && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Scoreboard Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-center space-y-1">
                  <span className="text-xs text-slate-400 block font-medium">Agreement Score</span>
                  <span className="text-3xl font-bold font-mono text-emerald-400">
                    {calibrationResults.agreement_score_percentage}%
                  </span>
                  <span className="text-[11px] text-slate-500 block">Human Correlation Index</span>
                </div>
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-center space-y-1">
                  <span className="text-xs text-slate-400 block font-medium">Avg Faithfulness</span>
                  <span className="text-3xl font-bold font-mono text-indigo-400">
                    {calibrationResults.avg_faithfulness}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Claim Grounding Score</span>
                </div>
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-center space-y-1">
                  <span className="text-xs text-slate-400 block font-medium">Judge Reliability</span>
                  <span className="text-sm font-bold font-mono text-emerald-300 block pt-1.5">
                    {calibrationResults.alignment_status}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {calibrationResults.total_cases_evaluated} Qs Evaluated
                  </span>
                </div>
              </div>

              {/* Automated Root Cause Diagnostics & Actionable Recommendations Card */}
              {calibrationResults.diagnostics && (
                <div className={`p-5 rounded-2xl border space-y-3 ${
                  calibrationResults.agreement_score_percentage >= 85
                    ? "bg-emerald-950/20 border-emerald-500/30"
                    : calibrationResults.diagnostics.primary_bottleneck.includes("Prompt")
                    ? "bg-amber-950/20 border-amber-500/30"
                    : "bg-indigo-950/20 border-indigo-500/30"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Diagnostic Assessment: {calibrationResults.diagnostics.primary_bottleneck}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        Rubric Issues: {calibrationResults.diagnostics.rubric_issues_detected || 0}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        Reasoning Flaws: {calibrationResults.diagnostics.model_reasoning_issues_detected || 0}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {calibrationResults.diagnostics.actionable_recommendations?.map((rec: string, rIdx: number) => (
                      <div key={rIdx} className="flex items-start gap-2 text-xs text-slate-200">
                        <span className="text-indigo-400 font-bold shrink-0">→</span>
                        <span className="leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evaluation Logs & Justifications List */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>Per-Question Calibration Reasoning & Breakdown</span>
                </h4>

                <div className="space-y-3">
                  {calibrationResults.detailed_results?.map((res: any, idx: number) => (
                    <div
                      key={res.case_id || idx}
                      className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-sm text-slate-200">
                            Q{idx + 1}: {res.question}
                          </strong>
                          {res.diagnostic_tag === "rubric_strictness" && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-semibold">
                              Rubric Strictness Penalty
                            </span>
                          )}
                          {res.diagnostic_tag === "model_reasoning_flaw" && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold">
                              Model Reasoning Flaw
                            </span>
                          )}
                          {res.diagnostic_tag === "aligned" && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                              Aligned
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 font-mono shrink-0">
                          <span className="px-2.5 py-0.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300 font-semibold">
                            Faith: {res.faithfulness}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-300 font-semibold">
                            Rel: {res.answer_relevance}
                          </span>
                        </div>
                      </div>

                      <div className="text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-xs leading-relaxed">
                        <strong className="text-slate-400 block mb-0.5 text-[11px]">Ground-Truth Answer:</strong>
                        {res.ground_truth_answer}
                      </div>

                      <div className="text-slate-400 italic bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs leading-relaxed">
                        <strong className="text-indigo-400 not-italic block mb-0.5 text-[11px] font-semibold">
                          Judge Reasoning:
                        </strong>
                        "{res.reasoning}"
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INTEGRATED IMPORT & SYNTHETIC QA GENERATION                        */}
      {/* ========================================================================= */}
      {activeTab === "import_generate" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
          {/* Card A: Import Custom Dataset (JSON/CSV) */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Import Custom Benchmark Dataset</h3>
                  <p className="text-xs text-slate-400">Upload `.json` or `.csv` ground-truth datasets.</p>
                </div>
              </div>

              {/* Dropzone */}
              <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-950/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all">
                <input
                  type="file"
                  className="hidden"
                  accept=".json,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const f = e.target.files[0];
                      setImportFile(f);
                      if (!importName) {
                        setImportName(f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
                      }
                      setImportError(null);
                    }
                  }}
                />
                {importFile ? (
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {importFile.name.endsWith(".csv") ? (
                        <FileSpreadsheet className="w-6 h-6" />
                      ) : (
                        <FileCode className="w-6 h-6" />
                      )}
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-white block">{importFile.name}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {(importFile.size / 1024).toFixed(1)} KB • Ready to parse
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-indigo-400 mb-2" />
                    <p className="text-xs font-semibold text-slate-200">
                      Click to browse or drag & drop JSON / CSV
                    </p>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10px] text-indigo-300 font-medium">
                      <Sparkles className="w-3 h-3" />
                      <span>Smart Auto-Schema Detection Enabled</span>
                    </div>
                  </>
                )}
              </label>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Dataset Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Legal Compliance Gold Standard"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Associate with Document (Optional)</label>
                  <select
                    value={importDocId}
                    onChange={(e) => setImportDocId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">None (Independent Benchmark)</option>
                    {documents?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.filename} ({d.chunk_count || 0} chunks)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Custom Column Mapping Accordion */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                    className="flex items-center justify-between w-full text-slate-300 hover:text-white text-xs font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Custom Column Mapping (Optional)
                    </span>
                    <span className="text-[10px] text-indigo-400">
                      {showAdvancedMapping ? "Hide" : "Configure"}
                    </span>
                  </button>

                  {showAdvancedMapping && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Override automatic detection by specifying exact column/key names or nested JSON path in your file:
                      </p>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">JSON Array Path (Optional, for nested JSON)</label>
                        <input
                          type="text"
                          placeholder="e.g. evaluation.test_cases or data.records"
                          value={customJsonPath}
                          onChange={(e) => setCustomJsonPath(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Question Field</label>
                          <input
                            type="text"
                            placeholder="e.g. query, prompt_v2"
                            value={customQuestionCol}
                            onChange={(e) => setCustomQuestionCol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Answer Field</label>
                          <input
                            type="text"
                            placeholder="e.g. gold_answer, target"
                            value={customAnswerCol}
                            onChange={(e) => setCustomAnswerCol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Expected Context Field (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. source_passage, facts"
                            value={customContextCol}
                            onChange={(e) => setCustomContextCol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Verified Flag Field (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. is_verified, approved"
                            value={customVerifiedCol}
                            onChange={(e) => setCustomVerifiedCol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Default Verification Toggle */}
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={defaultVerified}
                    onChange={(e) => setDefaultVerified(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Mark imported test cases as <strong className="text-white font-semibold">Verified (Gold Standard)</strong></span>
                </label>
              </div>

              {importError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span className="leading-relaxed">{importError}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!importFile || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 shadow-lg shadow-indigo-500/25 transition flex items-center justify-center gap-2 mt-4"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing & Importing Dataset...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Import Benchmark Dataset</span>
                </>
              )}
            </button>
          </div>

          {/* Card B: Auto-Synthesize QA Pairs */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/30">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Synthesize QA from Document</h3>
                  <p className="text-xs text-slate-400">Generate ground-truth questions automatically using an LLM.</p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Source Ingested Document</label>
                  <select
                    value={genDocId}
                    onChange={(e) => setGenDocId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">Select a document...</option>
                    {documents?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.filename} ({d.chunk_count || 0} chunks indexed)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Dataset Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Synthetic RAG Benchmark Suite"
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">Question Count</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={genNumQuestions}
                      onChange={(e) => setGenNumQuestions(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">Generator Model</label>
                    <select
                      value={genModel}
                      onChange={(e) => setGenModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono outline-none focus:border-indigo-500"
                    >
                      {[
                        { id: "llama3.2", label: "llama3.2 (Local 3B)", provider: "ollama" },
                        { id: "llama3.1:8b", label: "llama3.1:8b (Local 8B)", provider: "ollama" },
                        { id: "mistral:7b", label: "mistral:7b (Local 7B)", provider: "ollama" },
                        { id: "qwen2.5:7b", label: "qwen2.5:7b (Local 7B)", provider: "ollama" },
                        { id: "gpt-4o-mini", label: "gpt-4o-mini (OpenAI)", provider: "openai" },
                        { id: "gpt-4o", label: "gpt-4o (OpenAI)", provider: "openai" },
                        { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "anthropic" },
                        { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
                      ].map((opt) => {
                        const mInfo = modelMap.get(opt.id);
                        const statusTag = mInfo
                          ? mInfo.is_downloaded
                            ? `🟢 [Ready - ${mInfo.size_formatted || "Local"}]`
                            : opt.provider === "ollama"
                            ? `⬇️ [Download Needed]`
                            : `☁️ [Cloud API]`
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
              </div>
            </div>

            <button
              type="button"
              disabled={!genDocId || generateMutation.isPending}
              onClick={() => {
                const triggerGen = () => {
                  generateMutation.mutate({
                    document_id: genDocId,
                    name: genName || undefined,
                    num_questions: genNumQuestions,
                    provider: genModel.includes("claude")
                      ? "anthropic"
                      : genModel.includes("gemini")
                      ? "google"
                      : genModel.includes("llama") || genModel.includes("mistral") || genModel.includes("qwen")
                      ? "ollama"
                      : "openai",
                    model_name: genModel,
                  });
                };

                const targetModel = modelMap.get(genModel);
                if (targetModel && !targetModel.is_downloaded && targetModel.provider === "ollama") {
                  setModelsToDownload([targetModel]);
                  setIsDownloadModalOpen(true);
                  return;
                }

                triggerGen();
              }}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 disabled:opacity-40 transition shadow-lg shadow-purple-600/25 mt-4"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Synthesizing Benchmark Pairs...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Synthesize QA Benchmark</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Pre-Flight Model Download Modal (Only triggered if a chosen local model isn't yet pulled) */}
      <ModelDownloadModal
        isOpen={isDownloadModalOpen}
        modelsToDownload={modelsToDownload}
        onClose={() => setIsDownloadModalOpen(false)}
        onAllCompleted={() => {
          setIsDownloadModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["models"] });
          generateMutation.mutate({
            document_id: genDocId,
            name: genName || undefined,
            num_questions: genNumQuestions,
            provider: genModel.includes("claude")
              ? "anthropic"
              : genModel.includes("gemini")
              ? "google"
              : genModel.includes("llama") || genModel.includes("mistral") || genModel.includes("qwen")
              ? "ollama"
              : "openai",
            model_name: genModel,
          });
        }}
      />
    </div>
  );
}
