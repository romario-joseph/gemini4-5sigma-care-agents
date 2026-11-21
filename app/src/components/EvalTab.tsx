import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
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
  ShieldCheck,
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
  StressTestRunResponse,
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
  stressTestResult: StressTestRunResponse | null;
  isRunningStressTest: boolean;
  stressTestError: string | null;
  onRunStressTest: () => void;
}

function inferMediaFromFile(file: File): { mode: 'photo' | 'voice'; mimeType: string } | null {
  const nameLower = file.name.toLowerCase();
  const typeLower = (file.type || '').toLowerCase();

  if (typeLower.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/.test(nameLower)) {
    const ext = nameLower.split('.').pop();
    const mime =
      typeLower ||
      (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    return { mode: 'photo', mimeType: mime };
  }

  if (typeLower.startsWith('audio/') || /\.(m4a|mp3|wav|webm|ogg|aac)$/.test(nameLower)) {
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

function getMetricValue(
  metrics: EvalMetricRow[],
  key: string,
  side: 'careAgents' | 'singleCall',
  fallback: string
): string {
  const row = metrics.find((m) => m.key === key);
  return row ? row[side] : fallback;
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
  stressTestResult,
  isRunningStressTest,
  stressTestError,
  onRunStressTest,
}) => {
  const [showAllResults, setShowAllResults] = useState(false);
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
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const handleRemoveMedia = (caseId: string) => {
    const next = { ...loadedMedia };
    delete next[caseId];
    onUpdateLoadedMedia(next);
  };

  const handleExportResults = () => {
    const orderedResults = TEST_CASES.map((tc) => caseResults[tc.id]).filter(
      (r): r is EvalCaseResult => Boolean(r)
    );
    const csv = buildCsvExport(metrics, orderedResults, stressTestResult);
    const md = buildMarkdownExport(metrics, orderedResults, stressTestResult);
    downloadTextFile('care-agents-eval.csv', csv, 'text/csv;charset=utf-8');
    window.setTimeout(() => {
      downloadTextFile('care-agents-eval.md', md, 'text/markdown;charset=utf-8');
    }, 150);
    setExportNote('Exported care-agents-eval.csv and care-agents-eval.md');
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

  const loadedCount = Object.keys(loadedMedia).length;
  const progressPct =
    totalSteps > 0 ? Math.min(100, Math.round((completedCount / totalSteps) * 100)) : 0;
  const orderedCaseResults = Object.values(caseResults);
  const formatBreakdown = aggregateFormatBreakdown(orderedCaseResults);

  // 4 Headline KPI Numbers
  const needsFoundCare = getMetricValue(metrics, 'needs_found', 'careAgents', 'Pending');
  const needsFoundSingle = getMetricValue(metrics, 'needs_found', 'singleCall', 'Pending');

  const unsupportedCare = getMetricValue(metrics, 'unsupported_referrals', 'careAgents', '0%');
  const unsupportedSingle = getMetricValue(metrics, 'unsupported_referrals', 'singleCall', 'Pending');

  const officialDbCare = getMetricValue(metrics, 'official_db_found', 'careAgents', 'Pending');
  const officialDbSingle = getMetricValue(metrics, 'official_db_found', 'singleCall', 'Pending');

  const stressCaughtValue = stressTestResult
    ? `${stressTestResult.caughtCount} / ${stressTestResult.plantedTotal}`
    : 'Not run';
  const stressSubtext = stressTestResult
    ? `${stressTestResult.controlsKeptCount}/${stressTestResult.controlsTotal} controls kept`
    : '15 planted errors, 5 controls';

  return (
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-6">
      {/* Headline Results Card First */}
      <section className="calm-card p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="calm-heading">Care Agents vs single call</h1>
            <p className="mt-1 text-[14px] text-slate-600">
              20 NYC intake cases across text, photo, and voice, plus self-check stress testing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
              <FolderOpen className="h-4 w-4" />
              Load media{loadedCount > 0 ? ` (${loadedCount})` : ''}
            </button>

            <button
              type="button"
              onClick={onRunStressTest}
              disabled={isRunningStressTest || isRunningEval}
              className="ehr-btn-secondary"
            >
              {isRunningStressTest ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 text-[#2B6CB0]" />
                  Stress test
                </>
              )}
            </button>

            <button type="button" onClick={handleExportResults} className="ehr-btn-secondary">
              <Download className="h-4 w-4" />
              Export
            </button>

            {isRunningEval ? (
              <button
                type="button"
                onClick={onStopEval}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C53030] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#9B2C2C]"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setExportNote(null);
                    onStartEval(2);
                  }}
                  className="ehr-btn-secondary"
                >
                  <Repeat className="h-4 w-4 text-[#2B6CB0]" />
                  Run 2x
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportNote(null);
                    onStartEval(1);
                  }}
                  className="ehr-btn-primary"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Run full eval
                </button>
              </>
            )}
          </div>
        </div>

        {/* 4 Big Headline Numbers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="soft-surface p-4">
            <div className="text-[13px] font-medium text-slate-500">Needs found (F1)</div>
            <div className="mt-1.5 text-[26px] font-semibold text-[#1F3A5F] tabular-nums leading-tight">
              {needsFoundCare}
            </div>
            <div className="mt-1 text-[12.5px] text-slate-500 tabular-nums">
              Single call: {needsFoundSingle}
            </div>
          </div>

          <div className="soft-surface p-4">
            <div className="text-[13px] font-medium text-slate-500">Unsupported referrals</div>
            <div className="mt-1.5 text-[26px] font-semibold text-[#15803D] tabular-nums leading-tight">
              {unsupportedCare}
            </div>
            <div className="mt-1 text-[12.5px] text-slate-500 tabular-nums">
              Single call: {unsupportedSingle}
            </div>
          </div>

          <div className="soft-surface p-4">
            <div className="text-[13px] font-medium text-slate-500">Found in official NYC data</div>
            <div className="mt-1.5 text-[26px] font-semibold text-[#2B6CB0] tabular-nums leading-tight">
              {officialDbCare}
            </div>
            <div className="mt-1 text-[12.5px] text-slate-500 tabular-nums">
              Single call: {officialDbSingle}
            </div>
          </div>

          <div className="soft-surface p-4">
            <div className="text-[13px] font-medium text-slate-500">Stress test caught</div>
            <div className="mt-1.5 text-[26px] font-semibold text-[#15803D] tabular-nums leading-tight">
              {stressCaughtValue}
            </div>
            <div className="mt-1 text-[12.5px] text-slate-500 tabular-nums">{stressSubtext}</div>
          </div>
        </div>

        {/* Live Progress / Notices */}
        {exportNote ? (
          <p className="text-[13.5px] font-medium text-[#15803D]">{exportNote}</p>
        ) : null}

        {evalError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-[#C53030]">
            {evalError}
          </div>
        ) : null}

        {stressTestError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-[#C53030]">
            {stressTestError}
          </div>
        ) : null}

        {consistencySummary ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-emerald-950">
              2-run consistency: {consistencySummary.consistent} of {consistencySummary.total} cases matched
            </span>
            <span className="font-mono text-[16px] font-semibold text-[#15803D] tabular-nums">
              {consistencySummary.total > 0
                ? `${Math.round((consistencySummary.consistent / consistencySummary.total) * 100)}%`
                : 'N/A'}
            </span>
          </div>
        ) : null}

        {isRunningEval || completedCount > 0 ? (
          <div className="soft-surface p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[13.5px]">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                {isRunningEval ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#2B6CB0]" />
                ) : (
                  <Check className="h-4 w-4 text-[#15803D]" />
                )}
                <span>
                  {isRunningEval
                    ? `${runningTwoPass ? `Pass ${currentPass} of 2: ` : ''}${completedCount} of ${totalSteps} completed`
                    : `Completed ${completedCount} of ${totalSteps} cases`}
                </span>
              </div>
              <span className="font-mono text-[13px] text-slate-600 tabular-nums">
                {(evalElapsedMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#2B6CB0] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Toggle for Full Results */}
        <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-4">
          <span className="text-[13.5px] text-slate-500">
            Full comparison table, stress test rows, trend chart, and C01 to C20 cases
          </span>
          <button
            type="button"
            onClick={() => setShowAllResults((prev) => !prev)}
            className="ehr-btn-secondary"
            aria-expanded={showAllResults}
          >
            {showAllResults ? (
              <>
                <ChevronDown className="h-4 w-4" />
                Hide results
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                See all results
              </>
            )}
          </button>
        </div>
      </section>

      {/* Expandable Full Evaluation Details */}
      {showAllResults ? (
        <div className="space-y-6">
          {/* Full Comparison Table */}
          <section className="calm-card overflow-hidden">
            <div className="ehr-section-header">
              <span>Full comparison metrics</span>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button type="button" onClick={resetDefaults} className="ehr-btn-secondary py-1 px-2.5 text-[12.5px]">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset
                    </button>
                    <button type="button" onClick={() => setIsEditing(false)} className="ehr-btn-secondary py-1 px-2.5 text-[12.5px]">
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button type="button" onClick={saveEdits} className="ehr-btn-primary py-1 px-3 text-[12.5px]">
                      <Check className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={startEditing} className="ehr-btn-secondary py-1 px-2.5 text-[12.5px]">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Single call</th>
                    <th>Care Agents</th>
                  </tr>
                </thead>
                <tbody>
                  {(isEditing ? draftMetrics : metrics).map((row, idx) => (
                    <tr key={row.key}>
                      <td className="font-medium text-slate-900">{row.label}</td>
                      <td className="font-mono text-[13.5px] text-slate-600 tabular-nums">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.singleCall}
                            onChange={(e) => updateCell(idx, 'singleCall', e.target.value)}
                            className="w-full max-w-[200px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[13.5px]"
                          />
                        ) : (
                          row.singleCall
                        )}
                      </td>
                      <td className="font-mono text-[13.5px] font-semibold text-slate-900 tabular-nums">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.careAgents}
                            onChange={(e) => updateCell(idx, 'careAgents', e.target.value)}
                            className="w-full max-w-[200px] rounded-lg border border-[#2B6CB0] bg-white px-2.5 py-1 text-[13.5px]"
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
          </section>

          {/* Self-Check Stress Test */}
          <section className="calm-card overflow-hidden">
            <div className="ehr-section-header flex-wrap">
              <span>Can the self-check catch bad referrals?</span>
              <button
                type="button"
                onClick={onRunStressTest}
                disabled={isRunningStressTest || isRunningEval}
                className="ehr-btn-primary py-1.5 px-3 text-[13px]"
              >
                {isRunningStressTest ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Run stress test
                  </>
                )}
              </button>
            </div>

            {stressTestResult ? (
              <div className="p-4 space-y-4">
                <div className="soft-surface px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                  <span className="font-semibold text-[#1F3A5F]">
                    Caught {stressTestResult.caughtCount} of {stressTestResult.plantedTotal} planted errors,{' '}
                    {stressTestResult.controlsKeptCount} of {stressTestResult.controlsTotal} controls kept
                  </span>
                  <span className="font-mono text-[12.5px] text-slate-500 tabular-nums">
                    {stressTestResult.durationSeconds}s
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="ehr-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Referral</th>
                        <th>Planted error</th>
                        <th>Outcome</th>
                        <th>Evidence quote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stressTestResult.cases.map((item) => {
                        const isMiss = item.errorType !== 'control' && item.outcome === 'Verified';
                        const outcomeColor =
                          item.outcome === 'Rejected'
                            ? 'text-[#C53030]'
                            : item.outcome === 'Hours corrected from source'
                              ? 'text-[#2B6CB0]'
                              : item.outcome === 'Call to confirm'
                                ? 'text-[#D97706]'
                                : isMiss
                                  ? 'text-[#C53030]'
                                  : 'text-[#15803D]';
                        return (
                          <tr key={item.id}>
                            <td className="font-mono text-[13px] font-semibold text-slate-600 tabular-nums">
                              {item.id}
                            </td>
                            <td>
                              <div className="font-semibold text-slate-900">{item.referralName}</div>
                              <div className="text-[12.5px] text-slate-500">{item.claimedAddress}</div>
                            </td>
                            <td className="text-[13.5px] text-slate-700">{item.plantedError}</td>
                            <td className={`font-semibold text-[13px] whitespace-nowrap ${outcomeColor}`}>
                              {item.outcome}
                              {isMiss ? ' (Miss)' : ''}
                            </td>
                            <td className="text-[13px] text-slate-600 max-w-md">
                              {item.evidenceQuote ? `"${item.evidenceQuote}"` : 'None'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-5 text-[14px] text-slate-600">
                15 seeded bad referrals (wrong hours, wrong address, closed day) plus 5 untouched controls. Click Run stress test to run live checks.
              </div>
            )}
          </section>

          {/* D3 Run Trend Chart */}
          <EvalTrendChart
            runs={runHistory}
            isRunningEval={isRunningEval}
            onRunFullEval={() => onStartEval(1)}
            onClearHistory={onClearRunHistory}
          />

          {/* Input Type Breakdown */}
          <section className="calm-card overflow-hidden">
            <div className="ehr-section-header">
              <span>Breakdown by input type</span>
            </div>
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Input type</th>
                    <th>Cases</th>
                    <th>Single call F1</th>
                    <th>Single call unsupported</th>
                    <th>Care Agents F1</th>
                    <th>Care Agents unsupported</th>
                  </tr>
                </thead>
                <tbody>
                  {formatBreakdown.map((row) => (
                    <tr key={row.format}>
                      <td className="font-semibold text-slate-900">{row.label}</td>
                      <td className="font-mono text-[13px] text-slate-600 tabular-nums">
                        {row.count > 0
                          ? row.count
                          : `${TEST_CASES.filter((t) => t.expectedFormat === row.format).length} queued`}
                      </td>
                      <td className="font-mono text-[13px] text-slate-600 tabular-nums">
                        {row.singleCallF1}
                      </td>
                      <td className="font-mono text-[13px] text-slate-600 tabular-nums">
                        {row.singleCallUnsupported}
                      </td>
                      <td className="font-mono text-[13px] font-semibold text-slate-900 tabular-nums">
                        {row.careAgentsF1}
                      </td>
                      <td className="font-mono text-[13px] font-semibold text-slate-900 tabular-nums">
                        {row.careAgentsUnsupported}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Failures & Fixes Log */}
          <section className="calm-card p-5 space-y-4">
            <h2 className="text-[16px] font-semibold text-slate-900">Failures and fixes</h2>
            <form onSubmit={handleAddFailureFix} className="soft-surface p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={whatFailed}
                  onChange={(e) => setWhatFailed(e.target.value)}
                  placeholder="What failed"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
                />
                <input
                  type="text"
                  value={whatChanged}
                  onChange={(e) => setWhatChanged(e.target.value)}
                  placeholder="What changed"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={beforeScore}
                    onChange={(e) => setBeforeScore(e.target.value)}
                    placeholder="Before"
                    className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
                  />
                  <input
                    type="text"
                    value={afterScore}
                    onChange={(e) => setAfterScore(e.target.value)}
                    placeholder="After"
                    className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!whatFailed.trim() || !whatChanged.trim()}
                  className="ehr-btn-primary"
                >
                  <Plus className="h-4 w-4" />
                  Log fix
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-100">
              {failuresAndFixes.map((entry) => (
                <div
                  key={entry.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-0.5 text-[14px]">
                    <div className="font-semibold text-slate-900">{entry.whatFailed}</div>
                    <div className="text-slate-600">{entry.whatChanged}</div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-mono text-[13px] tabular-nums text-slate-600">
                      {entry.beforeScore} -&gt;{' '}
                      <strong className="text-[#15803D]">{entry.afterScore}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFailuresAndFixes(failuresAndFixes.filter((f) => f.id !== entry.id))
                      }
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Delete fix"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 20 Test Cases */}
          <section className="space-y-4">
            <h2 className="calm-heading">Test cases (C01 to C20)</h2>
            <div className="grid gap-4">
              {TEST_CASES.map((tc) => {
                const media = loadedMedia[tc.id];
                const res = caseResults[tc.id];

                return (
                  <div key={tc.id} className="calm-card p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-[13px] font-semibold text-[#2B6CB0]">
                            {tc.id}
                          </span>
                          <span className="font-semibold text-[15px] text-slate-900">
                            {tc.title}
                          </span>
                          {media ? (
                            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#15803D]">
                              {media.mode === 'photo' ? (
                                <FileImage className="h-3.5 w-3.5" />
                              ) : (
                                <FileAudio className="h-3.5 w-3.5" />
                              )}
                              {media.fileName}
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia(tc.id)}
                                className="ml-1 text-slate-400 hover:text-slate-700"
                                aria-label="Remove media"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[12.5px] text-slate-500">
                              <FileText className="h-3.5 w-3.5" />
                              Text
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13.5px] text-slate-600 truncate">{tc.text}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRunTestCase(tc)}
                        className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Run live
                      </button>
                    </div>

                    {res ? (
                      <div className="border-t border-slate-100 pt-3 grid gap-3 md:grid-cols-2 text-[13px]">
                        <div className="soft-surface p-3 space-y-1">
                          <div className="font-semibold text-slate-900">
                            Care Agents ({res.careAgents.durationSeconds}s)
                          </div>
                          {res.careAgents.checks.map((chk, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span
                                className={`font-semibold ${
                                  chk.passed ? 'text-[#15803D]' : 'text-[#C53030]'
                                }`}
                              >
                                {chk.passed ? 'Pass' : 'Fail'}
                              </span>
                              <span className="text-slate-700">
                                {chk.name}: {chk.reason}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="soft-surface p-3 space-y-1">
                          <div className="font-semibold text-slate-700">
                            Single call ({res.singleCall.durationSeconds}s)
                          </div>
                          {res.singleCall.checks.map((chk, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span
                                className={`font-semibold ${
                                  chk.passed ? 'text-[#15803D]' : 'text-[#C53030]'
                                }`}
                              >
                                {chk.passed ? 'Pass' : 'Fail'}
                              </span>
                              <span className="text-slate-700">
                                {chk.name}: {chk.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};
