import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_EVAL_METRICS, TEST_CASES } from '../data/resources.ts';
import type {
  EvalCaseResult,
  EvalMetricRow,
  EvalRunHistoryEntry,
  FailureFixEntry,
  LoadedMediaFile,
  TestCase,
} from '../types.ts';
import {
  aggregateFormatBreakdown,
  buildCsvExport,
  buildMarkdownExport,
} from '../utils/evalScoring.ts';
import { EvalTrendChart } from './EvalTrendChart.tsx';

interface EvalTabProps {
  metrics: EvalMetricRow[];
  onUpdateMetrics: (rows: EvalMetricRow[]) => void;
  caseResults: Record<string, EvalCaseResult>;
  runHistory: EvalRunHistoryEntry[];
  onClearRunHistory: () => void;
  loadedMedia: Record<string, LoadedMediaFile>;
  onUpdateLoadedMedia: (media: Record<string, LoadedMediaFile>) => void;
  failuresAndFixes: FailureFixEntry[];
  onUpdateFailuresAndFixes: (entries: FailureFixEntry[]) => void;
  onRunTestCase: (testCase: TestCase) => void;
  isRunningEval: boolean;
  runningTwoPass: boolean;
  currentPass: 1 | 2;
  completedCount: number;
  totalSteps: number;
  evalElapsedMs: number;
  evalError: string | null;
  consistencySummary: { consistent: number; total: number } | null;
  onStartEval: (passes: 1 | 2) => void;
  onStopEval: () => void;
  onResetDefaults: () => void;
}

function inferMediaFromFile(file: File): { mode: 'photo' | 'voice'; mimeType: string } | null {
  const nameLower = file.name.toLowerCase();
  const typeLower = (file.type || '').toLowerCase();

  if (
    typeLower.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|heic|heif)$/.test(nameLower)
  ) {
    const ext = nameLower.split('.').pop();
    const mime =
      typeLower ||
      (ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg');
    return { mode: 'photo', mimeType: mime };
  }

  if (
    typeLower.startsWith('audio/') ||
    /\.(m4a|mp3|wav|webm|ogg|aac)$/.test(nameLower)
  ) {
    const ext = nameLower.split('.').pop();
    const mime =
      typeLower ||
      (ext === 'm4a'
        ? 'audio/mp4'
        : ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'wav'
            ? 'audio/wav'
            : ext === 'ogg'
              ? 'audio/ogg'
              : 'audio/webm');
    return { mode: 'voice', mimeType: mime };
  }

  return null;
}

function matchCaseIdFromFilename(filename: string): string | null {
  const match = filename.match(/(c\d{2})/i);
  if (!match) return null;
  const candidate = match[1].toUpperCase();
  return TEST_CASES.some((t) => t.id === candidate) ? candidate : null;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const EvalTab: React.FC<EvalTabProps> = ({
  metrics,
  onUpdateMetrics,
  caseResults,
  runHistory,
  onClearRunHistory,
  loadedMedia,
  onUpdateLoadedMedia,
  failuresAndFixes,
  onUpdateFailuresAndFixes,
  onRunTestCase,
  isRunningEval,
  runningTwoPass,
  currentPass,
  completedCount,
  totalSteps,
  evalElapsedMs,
  evalError,
  consistencySummary,
  onStartEval,
  onStopEval,
  onResetDefaults,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftMetrics, setDraftMetrics] = useState<EvalMetricRow[]>(metrics);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const [whatFailed, setWhatFailed] = useState('');
  const [whatChanged, setWhatChanged] = useState('');
  const [beforeScore, setBeforeScore] = useState('');
  const [afterScore, setAfterScore] = useState('');

  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const startEditing = () => {
    setDraftMetrics(metrics.map((m) => ({ ...m })));
    setIsEditing(true);
  };

  const saveEdits = () => {
    onUpdateMetrics(draftMetrics);
    setIsEditing(false);
  };

  const resetDefaults = () => {
    setDraftMetrics(DEFAULT_EVAL_METRICS.map((m) => ({ ...m })));
    onResetDefaults();
    setIsEditing(false);
  };

  const updateCell = (idx: number, col: 'singleCall' | 'careAgents', value: string) => {
    setDraftMetrics((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [col]: value };
      return next;
    });
  };

  const handleLoadTestMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const updates: Record<string, LoadedMediaFile> = { ...loadedMedia };
    for (const file of files) {
      const caseId = matchCaseIdFromFilename(file.name);
      const inferred = inferMediaFromFile(file);
      if (!caseId || !inferred) continue;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Failed to read file'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      updates[caseId] = {
        fileName: file.name,
        mode: inferred.mode,
        dataUrl,
        mimeType: inferred.mimeType,
      };
    }

    onUpdateLoadedMedia(updates);
    if (mediaInputRef.current) {
      mediaInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = (caseId: string) => {
    const next = { ...loadedMedia };
    delete next[caseId];
    onUpdateLoadedMedia(next);
  };

  const handleRunEval = (passes: 1 | 2) => {
    setExportNote(null);
    onStartEval(passes);
  };

  const handleStopEval = () => {
    onStopEval();
  };

  const handleExportResults = () => {
    const orderedResults = TEST_CASES.map((tc) => caseResults[tc.id]).filter(
      (r): r is EvalCaseResult => Boolean(r)
    );
    const csv = buildCsvExport(metrics, orderedResults);
    const md = buildMarkdownExport(metrics, orderedResults);
    downloadTextFile('care-agents-eval.csv', csv, 'text/csv;charset=utf-8');
    window.setTimeout(() => {
      downloadTextFile('care-agents-eval.md', md, 'text/markdown;charset=utf-8');
    }, 150);
    setExportNote('Downloaded care-agents-eval.csv and care-agents-eval.md');
  };

  const handleAddFailureFix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatFailed.trim() || !whatChanged.trim()) return;
    const entry: FailureFixEntry = {
      id: `fix-${Date.now()}`,
      whatFailed: whatFailed.trim(),
      whatChanged: whatChanged.trim(),
      beforeScore: beforeScore.trim() || 'N/A',
      afterScore: afterScore.trim() || 'N/A',
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
    onUpdateFailuresAndFixes([entry, ...failuresAndFixes]);
    setWhatFailed('');
    setWhatChanged('');
    setBeforeScore('');
    setAfterScore('');
  };

  const handleDeleteFix = (id: string) => {
    onUpdateFailuresAndFixes(failuresAndFixes.filter((f) => f.id !== id));
  };

  const loadedCount = Object.keys(loadedMedia).length;
  const progressPct = totalSteps > 0 ? Math.min(100, Math.round((completedCount / totalSteps) * 100)) : 0;
  const orderedCaseResults = Object.values(caseResults);
  const formatBreakdown = aggregateFormatBreakdown(orderedCaseResults);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-3 space-y-4"
    >
      {/* Benchmark Header & Controls */}
      <section>
        <div className="ehr-panel p-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-bold text-[#1F3A5F]">
              Evaluation Benchmark (20 NYC Cases)
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-600">
              Single unverified call vs. Care Agents across text, handwritten photo, and voice intake cases.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={mediaInputRef}
              type="file"
              multiple
              accept="image/*,audio/*"
              onChange={(e) => void handleLoadTestMedia(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={isRunningEval}
              className="ehr-btn-secondary"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Load test media{loadedCount > 0 ? ` (${loadedCount})` : ''}
            </button>

            <button
              type="button"
              onClick={handleExportResults}
              className="ehr-btn-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              Export results
            </button>

            {isRunningEval ? (
              <button
                type="button"
                onClick={handleStopEval}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#C53030] border border-[#9B2C2C] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#9B2C2C] whitespace-nowrap"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop eval
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleRunEval(2)}
                  className="ehr-btn-secondary"
                >
                  <Repeat className="h-3.5 w-3.5 text-[#2B6CB0]" />
                  Run 2 times
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunEval(1)}
                  className="ehr-btn-primary"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run full eval
                </button>
              </>
            )}
          </div>
        </div>

        {exportNote ? (
          <p className="mt-3 text-[13px] font-medium text-emerald-700">{exportNote}</p>
        ) : null}

        {evalError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            {evalError}
          </div>
        ) : null}

        {/* Consistency Banner (after Run 2 times) */}
        {consistencySummary ? (
          <div className="mt-5 rounded-[16px] border border-emerald-200 bg-emerald-50/75 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14.5px] font-semibold text-emerald-950">
                2-run consistency report
              </h2>
              <p className="text-[13.5px] text-emerald-800">
                Same needs extracted across both runs: {consistencySummary.consistent} / {consistencySummary.total} cases ({consistencySummary.total > 0 ? Math.round((consistencySummary.consistent / consistencySummary.total) * 100) : 0}%).
              </p>
            </div>
            <span className="font-mono text-[18px] font-bold text-emerald-800 tabular-nums">
              {consistencySummary.total > 0
                ? `${Math.round((consistencySummary.consistent / consistencySummary.total) * 100)}%`
                : 'N/A'}
            </span>
          </div>
        ) : null}

        {/* Progress Bar */}
        {isRunningEval || completedCount > 0 ? (
          <div className="mt-5 soft-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <div className="flex items-center gap-2 font-medium text-neutral-800">
                {isRunningEval ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0071E3]" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                )}
                <span>
                  {isRunningEval
                    ? `${runningTwoPass ? `Pass ${currentPass} of 2: ` : ''}Running 3 cases at a time (${completedCount} of ${totalSteps} completed)`
                    : `Completed ${completedCount} of ${totalSteps} evaluations`}
                </span>
              </div>
              <span className="font-mono text-neutral-600 tabular-nums">
                {(evalElapsedMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/[0.08]">
              <div
                className="h-full rounded-full bg-[#0071E3] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Main Comparison Table */}
        <div className="mt-3 flex items-center justify-end gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={resetDefaults}
                className="ehr-btn-secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="ehr-btn-secondary"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdits}
                className="ehr-btn-primary"
              >
                <Check className="h-3.5 w-3.5" />
                Save results
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="ehr-btn-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit results
            </button>
          )}
        </div>

        <div className="mt-3 card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] bg-[#F5F5F7]/70 text-[13px] font-semibold text-neutral-600">
                  <th className="px-6 py-4">Metric</th>
                  <th className="px-6 py-4">Single call</th>
                  <th className="px-6 py-4 text-[#0071E3]">Care Agents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] text-[15px]">
                {(isEditing ? draftMetrics : metrics).map((row, idx) => (
                  <tr key={row.key} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-neutral-900">{row.label}</td>
                    <td className="px-6 py-3.5 font-mono text-[14px] text-neutral-600 tabular-nums">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.singleCall}
                          onChange={(e) => updateCell(idx, 'singleCall', e.target.value)}
                          className="w-full max-w-[220px] rounded-lg border border-black/[0.15] bg-white px-3 py-1.5 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
                        />
                      ) : (
                        row.singleCall
                      )}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[14px] font-semibold text-neutral-900 tabular-nums">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.careAgents}
                          onChange={(e) => updateCell(idx, 'careAgents', e.target.value)}
                          className="w-full max-w-[220px] rounded-lg border border-[#0071E3]/40 bg-white px-3 py-1.5 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
                        />
                      ) : (
                        row.careAgents
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black/[0.06] bg-[#F5F5F7]/40 px-6 py-3 text-[12.5px] text-neutral-500">
            Click &ldquo;Run full eval&rdquo; to evaluate all 20 cases or &ldquo;Run 2 times&rdquo; to measure cross-run consistency.
          </div>
        </div>
      </section>

      {/* D3 Run History Trend Chart */}
      <EvalTrendChart
        runs={runHistory}
        isRunningEval={isRunningEval}
        onRunFullEval={() => void handleRunEval(1)}
        onClearHistory={onClearRunHistory}
      />

      {/* Breakdown by Input Type (Text / Photo / Voice) */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px] font-semibold tracking-tight text-neutral-900">
            Breakdown by input type
          </h2>
          <span className="text-[13px] text-neutral-500">
            Text, handwritten photo, and voice note accuracy and unsupported rate
          </span>
        </div>

        <div className="mt-4 card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] bg-[#F5F5F7]/70 text-[13px] font-semibold text-neutral-600">
                  <th className="px-6 py-3.5">Input type</th>
                  <th className="px-6 py-3.5">Cases</th>
                  <th className="px-6 py-3.5">Single call F1</th>
                  <th className="px-6 py-3.5">Single call unsupported</th>
                  <th className="px-6 py-3.5 text-[#0071E3]">Care Agents F1</th>
                  <th className="px-6 py-3.5 text-[#0071E3]">Care Agents unsupported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] text-[14.5px]">
                {formatBreakdown.map((row) => (
                  <tr key={row.format} className="hover:bg-neutral-50/60">
                    <td className="px-6 py-3.5 font-semibold text-neutral-900">{row.label}</td>
                    <td className="px-6 py-3.5 font-mono text-neutral-600 tabular-nums">
                      {row.count > 0
                        ? row.count
                        : `${TEST_CASES.filter((t) => t.expectedFormat === row.format).length} queued`}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-neutral-600 tabular-nums">
                      {row.singleCallF1}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-neutral-600 tabular-nums">
                      {row.singleCallUnsupported}
                    </td>
                    <td className="px-6 py-3.5 font-mono font-semibold text-neutral-900 tabular-nums">
                      {row.careAgentsF1}
                    </td>
                    <td className="px-6 py-3.5 font-mono font-semibold text-neutral-900 tabular-nums">
                      {row.careAgentsUnsupported}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Failures and Fixes Log */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px] font-semibold tracking-tight text-neutral-900">
            Failures and fixes
          </h2>
          <span className="text-[13px] text-neutral-500">
            Track root-cause eval failures, prompt/system changes, and measured before/after score lifts.
          </span>
        </div>

        <form onSubmit={handleAddFailureFix} className="mt-4 soft-surface p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[12px] font-medium text-neutral-600 mb-1">
                What failed
              </label>
              <input
                type="text"
                value={whatFailed}
                onChange={(e) => setWhatFailed(e.target.value)}
                placeholder="e.g., C05 incomplete ZIP parsed as 10400"
                className="w-full rounded-xl border border-black/[0.1] bg-white px-3.5 py-2 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-neutral-600 mb-1">
                What I changed
              </label>
              <input
                type="text"
                value={whatChanged}
                onChange={(e) => setWhatChanged(e.target.value)}
                placeholder="e.g., Require 5 digits cleanly else route to unclear[]"
                className="w-full rounded-xl border border-black/[0.1] bg-white px-3.5 py-2 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[12px] font-medium text-neutral-600 mb-1">
                  Before score
                </label>
                <input
                  type="text"
                  value={beforeScore}
                  onChange={(e) => setBeforeScore(e.target.value)}
                  placeholder="e.g., 85%"
                  className="w-36 rounded-xl border border-black/[0.1] bg-white px-3.5 py-2 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-neutral-600 mb-1">
                  After score
                </label>
                <input
                  type="text"
                  value={afterScore}
                  onChange={(e) => setAfterScore(e.target.value)}
                  placeholder="e.g., 100%"
                  className="w-36 rounded-xl border border-black/[0.1] bg-white px-3.5 py-2 text-[14px] text-neutral-900 focus:border-[#0071E3] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!whatFailed.trim() || !whatChanged.trim()}
              className="ehr-btn-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Log fix
            </button>
          </div>
        </form>

        <div className="mt-4 grid gap-3">
          {failuresAndFixes.map((entry) => (
            <div
              key={entry.id}
              className="card-surface p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="text-[14px] font-semibold text-neutral-900">
                  Failed: <span className="font-normal text-neutral-700">{entry.whatFailed}</span>
                </div>
                <div className="text-[14px] font-semibold text-neutral-900">
                  Change: <span className="font-normal text-neutral-700">{entry.whatChanged}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right font-mono text-[13px] tabular-nums">
                  <div className="text-neutral-500">Before: {entry.beforeScore}</div>
                  <div className="font-semibold text-emerald-700">After: {entry.afterScore}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteFix(entry.id)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="Remove failure log entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Test Cases C01 to C20 */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px] font-semibold tracking-tight text-neutral-900">
            Test cases (C01 to C20)
          </h2>
          <span className="text-[13px] text-neutral-500">
            Each case uses its loaded media file if uploaded, otherwise its text.
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {TEST_CASES.map((tc) => {
            const media = loadedMedia[tc.id];
            const res = caseResults[tc.id];

            return (
              <div key={tc.id} className="card-surface p-4 sm:px-6 sm:py-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-[#0071E3] tabular-nums">
                        {tc.id}
                      </span>
                      <span aria-hidden="true" className="text-neutral-300">
                        ·
                      </span>
                      <h3 className="text-[15px] font-semibold text-neutral-900">{tc.title}</h3>
                      <span aria-hidden="true" className="text-neutral-300">
                        ·
                      </span>
                      {media ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700">
                          {media.mode === 'photo' ? (
                            <FileImage className="h-3.5 w-3.5" />
                          ) : (
                            <FileAudio className="h-3.5 w-3.5" />
                          )}
                          Input: {media.fileName}
                          <button
                            type="button"
                            onClick={() => handleRemoveMedia(tc.id)}
                            className="ml-1 text-neutral-400 hover:text-neutral-700"
                            aria-label={`Remove ${media.fileName}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12.5px] text-neutral-500">
                          <FileText className="h-3.5 w-3.5" />
                          Input: Text{tc.expectedFormat !== 'text' ? ` (${tc.expectedFormat} fallback)` : ''}
                        </span>
                      )}

                      {res && typeof res.consistentDomains === 'boolean' ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            res.consistentDomains
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {res.consistentDomains ? '2/2 consistent' : 'Varied across runs'}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-[13.5px] text-neutral-600">{tc.description}</p>
                    <p className="mt-2 rounded-lg bg-[#F5F5F7] px-3 py-2 text-[13px] text-neutral-700 font-mono break-words">
                      {tc.text}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRunTestCase(tc)}
                    className="ehr-btn-primary self-start"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Run live
                  </button>
                </div>

                {/* Per-case Pass / Fail Breakdown */}
                {res ? (
                  <div className="border-t border-black/[0.06] pt-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-neutral-500">
                      <span>Evaluated using {res.inputLabel}</span>
                      <span className="font-mono tabular-nums">
                        Care Agents {res.careAgents.durationSeconds}s | Single call {res.singleCall.durationSeconds}s
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {/* Care Agents checks */}
                      <div className="rounded-xl bg-[#F5F5F7]/75 p-3">
                        <div className="text-[12px] font-semibold text-neutral-900 mb-2">
                          Care Agents
                        </div>
                        <div className="space-y-1.5">
                          {res.careAgents.checks.map((chk, i) => (
                            <div key={i} className="flex items-start gap-2 text-[12.5px]">
                              <span
                                className={`mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                  chk.passed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {chk.passed ? 'Pass' : 'Fail'}
                              </span>
                              <span className="text-neutral-700">
                                <span className="font-medium text-neutral-900">{chk.name}:</span>{' '}
                                {chk.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Single Call checks */}
                      <div className="rounded-xl bg-[#F5F5F7]/75 p-3">
                        <div className="text-[12px] font-semibold text-neutral-700 mb-2">
                          Single call
                        </div>
                        <div className="space-y-1.5">
                          {res.singleCall.checks.map((chk, i) => (
                            <div key={i} className="flex items-start gap-2 text-[12.5px]">
                              <span
                                className={`mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                  chk.passed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {chk.passed ? 'Pass' : 'Fail'}
                              </span>
                              <span className="text-neutral-700">
                                <span className="font-medium text-neutral-900">{chk.name}:</span>{' '}
                                {chk.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
};
