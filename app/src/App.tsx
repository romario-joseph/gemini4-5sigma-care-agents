/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EvalTab } from './components/EvalTab.tsx';
import { FollowUpsTab } from './components/FollowUpsTab.tsx';
import { ActivityTabStrip, SystemBar } from './components/Header.tsx';
import { OverviewTab } from './components/OverviewTab.tsx';
import { PatientWorkspace, type ExternalRunPayload } from './components/PatientWorkspace.tsx';
import { ResourcesTab } from './components/ResourcesTab.tsx';
import {
  createDemoCompletedFollowUp,
  DEFAULT_EVAL_METRICS,
  DEFAULT_FAILURE_FIXES,
  TEST_CASES,
} from './data/resources.ts';
import type {
  AgentStepItem,
  EvalCaseResult,
  EvalMetricRow,
  EvalRunHistoryEntry,
  ExpectedFormat,
  FailureFixEntry,
  FollowUpItem,
  InputMode,
  IntakeExtraction,
  LoadedMediaFile,
  ManagedAgentRunStatus,
  ModelTraceEntry,
  NeedDomain,
  PatientRecord,
  PatientStep,
  PipelineResult,
  StressTestRunResponse,
  TabId,
  TestCase,
} from './types.ts';
import {
  aggregateEvalMetrics,
  scoreEvalCase,
  summarizeEvalRunForHistory,
  type EvalRunMetricsSnapshot,
} from './utils/evalScoring.ts';
import {
  buildTimelineForIntake,
  createSamplePatients,
  derivePatientChart,
  formatSyntheticMrn,
  inferBoroughFromZip,
  type MissingQuestionPrompt,
} from './utils/patientChart.ts';

const FOLLOWUPS_STORAGE_KEY = 'care_agents_followups_v2';
const PATIENTS_STORAGE_KEY = 'care_agents_patients_v2';
const EVAL_STORAGE_KEY = 'care_agents_eval_metrics_v5';
const EVAL_HISTORY_STORAGE_KEY = 'care_agents_eval_history_v1';
const EVAL_COUNTER_STORAGE_KEY = 'care_agents_eval_counter_v1';
const FIXES_STORAGE_KEY = 'care_agents_failure_fixes_v3';

interface AgentJobPollResponse {
  jobId: string;
  status: ManagedAgentRunStatus;
  steps: AgentStepItem[];
  interactionId?: string;
  environmentId?: string;
  error?: string;
  usedFallback?: boolean;
  structuredByHydrogen?: boolean;
  result?: {
    status: 'Verified open' | 'Schedule change noted' | 'Closed';
    verificationDetails: string;
    evidenceQuote: string;
    latestSourceUrl: string;
    checkInMessage: string;
    agentSummary?: string;
  };
}

interface CarbonJobPollResponse {
  jobId: string;
  status: 'running' | 'done' | 'error';
  reason: string;
  updated: boolean;
  intake?: IntakeExtraction;
  traceEntry?: ModelTraceEntry;
  error?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [patientStep, setPatientStep] = useState<PatientStep>(1);
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const [patients, setPatients] = useState<PatientRecord[]>(() => {
    try {
      const saved = localStorage.getItem(PATIENTS_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as PatientRecord[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [sampleRecordOverride, setSampleRecordOverride] = useState<PatientRecord | null>(null);

  const [followUps, setFollowUps] = useState<FollowUpItem[]>(() => {
    try {
      const saved = localStorage.getItem(FOLLOWUPS_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as FollowUpItem[]) : [];
    } catch {
      return [];
    }
  });

  const [evalMetrics, setEvalMetrics] = useState<EvalMetricRow[]>(() => {
    try {
      const saved = localStorage.getItem(EVAL_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as EvalMetricRow[]) : DEFAULT_EVAL_METRICS;
    } catch {
      return DEFAULT_EVAL_METRICS;
    }
  });

  const [failuresAndFixes, setFailuresAndFixes] = useState<FailureFixEntry[]>(() => {
    try {
      const saved = localStorage.getItem(FIXES_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as FailureFixEntry[]) : DEFAULT_FAILURE_FIXES;
    } catch {
      return DEFAULT_FAILURE_FIXES;
    }
  });

  const [evalCaseResults, setEvalCaseResults] = useState<Record<string, EvalCaseResult>>({});
  const [evalRunHistory, setEvalRunHistory] = useState<EvalRunHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(EVAL_HISTORY_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as EvalRunHistoryEntry[];
      return Array.isArray(parsed) ? parsed.slice(-10) : [];
    } catch {
      return [];
    }
  });
  const [loadedMedia, setLoadedMedia] = useState<Record<string, LoadedMediaFile>>({});
  const [externalRunRequest, setExternalRunRequest] = useState<ExternalRunPayload | null>(null);

  const [isRunningEval, setIsRunningEval] = useState(false);
  const [runningTwoPass, setRunningTwoPass] = useState(false);
  const [currentEvalPass, setCurrentEvalPass] = useState<1 | 2>(1);
  const [evalCompletedCount, setEvalCompletedCount] = useState(0);
  const [evalTotalSteps, setEvalTotalSteps] = useState(TEST_CASES.length);
  const [evalElapsedMs, setEvalElapsedMs] = useState(0);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [consistencySummary, setConsistencySummary] = useState<{
    consistent: number;
    total: number;
  } | null>(null);
  const [stressTestResult, setStressTestResult] = useState<StressTestRunResponse | null>(null);
  const [isRunningStressTest, setIsRunningStressTest] = useState(false);
  const [stressTestError, setStressTestError] = useState<string | null>(null);

  const evalAbortRef = useRef<AbortController | null>(null);
  const evalTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (evalTimerRef.current !== null) window.clearInterval(evalTimerRef.current);
      evalAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients.slice(0, 30)));
    } catch {
      // Ignore storage quota errors
    }
  }, [patients]);

  useEffect(() => {
    try {
      localStorage.setItem(FOLLOWUPS_STORAGE_KEY, JSON.stringify(followUps));
    } catch {
      // Ignore storage quota errors
    }
  }, [followUps]);

  useEffect(() => {
    try {
      localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify(evalMetrics));
    } catch {
      // Ignore storage quota errors
    }
  }, [evalMetrics]);

  useEffect(() => {
    try {
      localStorage.setItem(EVAL_HISTORY_STORAGE_KEY, JSON.stringify(evalRunHistory.slice(-10)));
    } catch {
      // Ignore storage quota errors
    }
  }, [evalRunHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(FIXES_STORAGE_KEY, JSON.stringify(failuresAndFixes));
    } catch {
      // Ignore storage quota errors
    }
  }, [failuresAndFixes]);

  // Background poller for non-blocking Gemini 4 Carbon double-check jobs
  useEffect(() => {
    if (demoMode) return;
    const pendingPatients = patients.filter(
      (p) => p.result.carbonJobId && p.result.carbonPending
    );
    if (pendingPatients.length === 0) return;

    let cancelled = false;
    const pollCarbon = async () => {
      await Promise.all(
        pendingPatients.map(async (pt) => {
          const jobId = pt.result.carbonJobId;
          if (!jobId) return;
          try {
            const res = await fetch(`/api/intake/carbon/${encodeURIComponent(jobId)}`);
            if (!res.ok) return;
            const job = (await res.json()) as CarbonJobPollResponse;
            if (cancelled || job.status === 'running') return;

            setPatients((prev) =>
              prev.map((curr) => {
                if (curr.id !== pt.id) return curr;
                const nextTrace = job.traceEntry
                  ? [...(curr.result.modelTrace || []), job.traceEntry]
                  : curr.result.modelTrace;
                return {
                  ...curr,
                  result: {
                    ...curr.result,
                    carbonPending: false,
                    intake: job.status === 'done' && job.updated && job.intake
                      ? job.intake
                      : curr.result.intake,
                    modelTrace: nextTrace,
                  },
                };
              })
            );
          } catch {
            // Retry on next interval
          }
        })
      );
    };

    void pollCarbon();
    const timer = window.setInterval(() => {
      void pollCarbon();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [patients, demoMode]);

  // Background poller for active Gemini Managed Agent follow-up runs
  useEffect(() => {
    if (demoMode) return;
    const activeJobs = followUps.filter(
      (f) => f.agentJobId && (f.agentStatus === 'Queued' || f.agentStatus === 'Running')
    );
    if (activeJobs.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      await Promise.all(
        activeJobs.map(async (item) => {
          if (!item.agentJobId) return;
          try {
            const res = await fetch(`/api/followup/agent/${encodeURIComponent(item.agentJobId)}`);
            if (!res.ok) return;
            const job = (await res.json()) as AgentJobPollResponse;
            if (cancelled) return;

            setFollowUps((prev) =>
              prev.map((curr) => {
                if (curr.id !== item.id) return curr;
                return {
                  ...curr,
                  agentStatus: job.status,
                  agentSteps: job.steps,
                  interactionId: job.interactionId || curr.interactionId,
                  environmentId: job.environmentId || curr.environmentId,
                  agentError: job.error,
                  usedFallback: Boolean(job.usedFallback),
                  structuredByHydrogen: Boolean(job.structuredByHydrogen),
                  ...(job.result
                    ? {
                        status: job.result.status,
                        verificationDetails: job.result.verificationDetails,
                        evidenceQuote: job.result.evidenceQuote,
                        latestSourceUrl: job.result.latestSourceUrl || curr.referralUrl,
                        checkInMessage: job.result.checkInMessage,
                        agentSummary: job.result.agentSummary || curr.agentSummary,
                        lastCheckedAt: new Date().toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      }
                    : {}),
                };
              })
            );
          } catch {
            // Retry on next interval
          }
        })
      );
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [followUps, demoMode]);

  const samplePatients = useMemo(() => createSamplePatients(), []);
  const allChartPatients = useMemo(() => {
    if (patients.length > 0) return patients;
    if (sampleRecordOverride) return [sampleRecordOverride];
    return samplePatients;
  }, [patients, sampleRecordOverride, samplePatients]);

  const activePatientIndex = useMemo(() => {
    const idx = allChartPatients.findIndex((p) => p.id === selectedPatientId);
    return idx >= 0 ? idx : 0;
  }, [allChartPatients, selectedPatientId]);

  const activePatient = allChartPatients[activePatientIndex];
  const activeChart = useMemo(
    () => derivePatientChart(activePatient, activePatientIndex),
    [activePatient, activePatientIndex]
  );

  const activePatientFollowUps = useMemo(() => {
    const cleanName = activePatient.name.toLowerCase().trim();
    return followUps.filter((f) => {
      const fName = f.patientFirstName.toLowerCase().trim();
      return fName === cleanName || cleanName.startsWith(fName) || fName.startsWith(cleanName);
    });
  }, [followUps, activePatient.name]);

  const mutateActivePatient = (updater: (prev: PatientRecord) => PatientRecord) => {
    if (patients.length === 0) {
      setSampleRecordOverride((prev) => updater(prev || samplePatients[0]));
      return;
    }
    setPatients((prev) =>
      prev.map((p) => (p.id === activePatient.id ? updater(p) : p))
    );
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    mutateActivePatient((p) => {
      const existing = p.acknowledgedAlertIds || [];
      if (existing.includes(alertId)) return p;
      return {
        ...p,
        acknowledgedAlertIds: [...existing, alertId],
      };
    });
  };

  const handleUpdateActiveOutreachDraft = (nextDraft: string) => {
    mutateActivePatient((p) => ({
      ...p,
      result: {
        ...p.result,
        outreachDraft: nextDraft,
      },
    }));
  };

  const handleAddQuestionToOutreach = (prompt: MissingQuestionPrompt) => {
    const addition =
      prompt.targetLanguage.toLowerCase() !== 'english'
        ? `${prompt.domain}: ${prompt.englishQuestion} | ${prompt.translatedQuestion}`
        : `${prompt.domain}: ${prompt.englishQuestion}`;

    mutateActivePatient((p) => {
      const current = (p.result.outreachDraft || '').trim();
      if (current.includes(prompt.englishQuestion.slice(0, 28))) return p;
      const nextDraft = current ? `${current}\n\n${addition}` : addition;
      return {
        ...p,
        result: {
          ...p.result,
          outreachDraft: nextDraft,
        },
      };
    });
  };

  const handleIntakeCompleted = (result: PipelineResult, mode: InputMode) => {
    const nowIso = new Date().toISOString();
    const firstName = (result.intake.patient_first_name || '').trim();
    const zipPart = result.intake.zip || 'NYC';
    const displayName = firstName || `Synthetic Patient (${zipPart})`;
    const newId = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const newRecord: PatientRecord = {
      id: newId,
      mrn: formatSyntheticMrn(newId, patients.length),
      name: displayName,
      borough: inferBoroughFromZip(result.intake.zip, result.intake.borough),
      pcp: 'Not on file',
      isSample: false,
      inputMode: mode,
      lastIntakeIso: nowIso,
      acknowledgedAlertIds: [],
      result,
      timeline: buildTimelineForIntake(result, mode, nowIso),
    };

    setPatients((prev) => [newRecord, ...prev]);
    setSelectedPatientId(newRecord.id);
  };

  const handleSelectPatient = (patient: PatientRecord) => {
    setSelectedPatientId(patient.id);
    setActiveTab('patient');
    setPatientStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartIntakeWithMode = (mode: InputMode, clearResult: boolean = false) => {
    setActiveTab('patient');
    setPatientStep(1);
    setExternalRunRequest({
      mode,
      nonce: Date.now(),
      autoRun: false,
      clearResult,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateFollowUp = (item: FollowUpItem) => {
    setFollowUps((prev) => [item, ...prev]);
    setPatients((prev) =>
      prev.map((p, idx) => {
        const nameMatch =
          p.name.toLowerCase() === item.patientFirstName.toLowerCase() || idx === 0;
        if (!nameMatch) return p;
        return {
          ...p,
          outreachApproved: true,
          timeline: [
            ...p.timeline,
            {
              id: `tl-approved-${Date.now()}`,
              type: 'outreach_approved',
              title: `Approved outreach and queued Follow-up agent (${item.referralName})`,
              detail: `${item.dueLabel}. Managed Agent checking availability.`,
              timestampIso: new Date().toISOString(),
            },
          ],
        };
      })
    );
  };

  const handleApproveAndSendFromOutreach = async (patient: PatientRecord, draft: string) => {
    const actionable = patient.result.verifiedReferrals;
    const primary = actionable[0] || {
      id: 'fallback-ref',
      need_id: 'need-1',
      domain: 'other' as const,
      name: 'NYC 311 Helpline',
      address: 'Citywide NYC',
      phone: '311',
      hours: '24/7',
      eligibility: 'All NYC residents',
      source_url: 'https://portal.311.nyc.gov/',
      why_matches: 'Citywide helpline',
      verified: false,
      verification_note: 'Call 311',
    };

    const referralsPayload = (actionable.length > 0 ? actionable : [primary])
      .slice(0, 3)
      .map((r) => ({
        name: r.name,
        address: r.address,
        hours: r.hours,
        source_url: r.source_url,
      }));

    const targetLang =
      patient.result.intake.language && patient.result.intake.language !== 'unknown'
        ? patient.result.intake.language
        : 'English';

    if (demoMode) {
      const demoFollowUp = createDemoCompletedFollowUp({
        patientFirstName: patient.name,
        referralName: primary.name,
        referralAddress: primary.address,
        referralHours: primary.hours,
        referralUrl: primary.source_url,
        language: targetLang,
        constraints: patient.result.intake.constraints,
        referrals: referralsPayload,
      });

      mutateActivePatient((p) => ({
        ...p,
        outreachApproved: true,
        result: { ...p.result, outreachDraft: draft },
        timeline: [
          ...p.timeline,
          {
            id: `tl-approved-${Date.now()}`,
            type: 'outreach_approved',
            title: `Approved outreach (${primary.name})`,
            detail: `${demoFollowUp.dueLabel}. Verified open in Demo mode.`,
            timestampIso: new Date().toISOString(),
          },
        ],
      }));

      setFollowUps((prev) => [demoFollowUp, ...prev]);
      return;
    }

    const res = await fetch('/api/followup/agent/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientFirstName: patient.name,
        language: targetLang,
        constraints: patient.result.intake.constraints,
        referrals: referralsPayload,
      }),
    });

    const data = (await res.json()) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) {
      throw new Error(data.error || 'Failed to start Managed Agent follow-up.');
    }

    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const formattedDate = dueDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    mutateActivePatient((p) => ({
      ...p,
      outreachApproved: true,
      result: { ...p.result, outreachDraft: draft },
      timeline: [
        ...p.timeline,
        {
          id: `tl-approved-${Date.now()}`,
          type: 'outreach_approved',
          title: `Approved outreach and queued Follow-up agent (${primary.name})`,
          detail: `Due in 3 days (${formattedDate}). Managed Agent checking availability.`,
          timestampIso: new Date().toISOString(),
        },
      ],
    }));

    setFollowUps((prev) => [
      {
        id: `fu-${Date.now()}`,
        patientFirstName: patient.name,
        referralName: primary.name,
        referralAddress: primary.address,
        referralHours: primary.hours,
        referralUrl: primary.source_url,
        referrals: referralsPayload,
        constraints: patient.result.intake.constraints,
        language: targetLang,
        dueDateIso: dueDate.toISOString(),
        dueLabel: `Due in 3 days (${formattedDate})`,
        status: 'Scheduled',
        agentJobId: data.jobId,
        agentStatus: 'Queued',
        agentSteps: [
          {
            id: 'queued',
            type: 'status',
            label: 'Queued Follow-up agent (Gemini Managed Agent)',
          },
        ],
      },
      ...prev,
    ]);
  };

  const handleUpdateFollowUp = (id: string, patch: Partial<FollowUpItem>) => {
    setFollowUps((prev) => prev.map((fu) => (fu.id === id ? { ...fu, ...patch } : fu)));
  };

  const handleRunAgentForOverviewTask = async (task: {
    followUpId?: string;
    patientFirstName: string;
    language: string;
    constraints: string[];
    referrals: Array<{
      name: string;
      address: string;
      hours: string;
      source_url: string;
    }>;
  }) => {
    if (demoMode) {
      const primary = task.referrals[0];
      const completed = createDemoCompletedFollowUp({
        patientFirstName: task.patientFirstName,
        referralName: primary.name,
        referralAddress: primary.address,
        referralHours: primary.hours,
        referralUrl: primary.source_url,
        language: task.language,
        constraints: task.constraints,
        referrals: task.referrals,
      });
      if (task.followUpId) {
        handleUpdateFollowUp(task.followUpId, {
          agentStatus: 'Done',
          status: 'Verified open',
          agentError: undefined,
          usedFallback: false,
          evidenceQuote: completed.evidenceQuote,
          agentSummary: completed.agentSummary,
          checkInMessage: completed.checkInMessage,
          agentSteps: completed.agentSteps,
          lastCheckedAt: completed.lastCheckedAt,
        });
      } else {
        handleCreateFollowUp(completed);
      }
      return;
    }

    const res = await fetch('/api/followup/agent/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientFirstName: task.patientFirstName,
        language: task.language,
        constraints: task.constraints,
        referrals: task.referrals,
      }),
    });

    const data = (await res.json()) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) {
      throw new Error(data.error || 'Failed to launch Managed Agent.');
    }

    const dueDate = new Date();
    const formattedDate = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const primary = task.referrals[0];
    handleCreateFollowUp({
      id: `fu-${Date.now()}`,
      patientFirstName: task.patientFirstName,
      referralName: primary.name,
      referralAddress: primary.address,
      referralHours: primary.hours,
      referralUrl: primary.source_url,
      referrals: task.referrals,
      constraints: task.constraints,
      language: task.language,
      dueDateIso: dueDate.toISOString(),
      dueLabel: `Today (${formattedDate})`,
      status: 'Scheduled',
      agentJobId: data.jobId,
      agentStatus: 'Queued',
      agentSteps: [
        {
          id: 'queued',
          type: 'status',
          label: 'Queued Follow-up agent (Gemini Managed Agent)',
        },
      ],
    });
  };

  const handleRecordEvalRun = (snapshot: EvalRunMetricsSnapshot) => {
    setEvalRunHistory((prev) => {
      let nextCounter = (prev[prev.length - 1]?.runNumber ?? 0) + 1;
      try {
        const storedCounter = Number(localStorage.getItem(EVAL_COUNTER_STORAGE_KEY) || '0');
        if (Number.isFinite(storedCounter) && storedCounter >= nextCounter) {
          nextCounter = storedCounter + 1;
        }
        localStorage.setItem(EVAL_COUNTER_STORAGE_KEY, String(nextCounter));
      } catch {
        // Ignore storage errors
      }
      const entry: EvalRunHistoryEntry = {
        id: `eval-run-${Date.now()}-${nextCounter}`,
        runNumber: nextCounter,
        timestampIso: new Date().toISOString(),
        label: `Run ${nextCounter}`,
        ...snapshot,
      };
      return [...prev, entry].slice(-10);
    });
  };

  const handleClearRunHistory = () => {
    setEvalRunHistory([]);
    try {
      localStorage.removeItem(EVAL_HISTORY_STORAGE_KEY);
      localStorage.removeItem(EVAL_COUNTER_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const sameDomainSet = (a: NeedDomain[], b: NeedDomain[]): boolean => {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((val, idx) => val === sb[idx]);
  };

  const runSingleEvalPass = async (
    passNumber: 1 | 2,
    controller: AbortController,
    mediaSnapshot: Record<string, LoadedMediaFile>,
    priorPassResults?: Record<string, EvalCaseResult>
  ): Promise<Record<string, EvalCaseResult>> => {
    const passMap: Record<string, EvalCaseResult> = {};
    let nextIndex = 0;
    const total = TEST_CASES.length;
    const concurrency = 3;

    const runWorker = async () => {
      while (nextIndex < total && !controller.signal.aborted) {
        const currentIdx = nextIndex;
        nextIndex += 1;
        const tc = TEST_CASES[currentIdx];
        const media = mediaSnapshot[tc.id];
        const inputUsed: 'file' | 'text' = media ? 'file' : 'text';
        const inputFormat: ExpectedFormat = media ? media.mode : tc.expectedFormat;
        const inputLabel = media ? `File: ${media.fileName}` : 'Text';

        try {
          const res = await fetch('/api/eval/case', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(
              media
                ? { mode: media.mode, fileData: media.dataUrl, mimeType: media.mimeType }
                : { mode: 'text', text: tc.text }
            ),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Case ${tc.id} failed (${res.status})`);

          const scored = scoreEvalCase(
            tc,
            inputUsed,
            inputFormat,
            inputLabel,
            data.careAgents,
            data.singleCall
          );

          if (passNumber === 2 && priorPassResults?.[tc.id]) {
            const p1 = priorPassResults[tc.id].careAgents;
            const p2 = scored.careAgents;
            if (!p1.error && !p2.error) {
              scored.consistentDomains = sameDomainSet(p1.predictedDomains, p2.predictedDomains);
            }
          }

          passMap[tc.id] = scored;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          const errMsg = err instanceof Error ? err.message : 'Case failed';
          const failedSide = {
            needsF1: null,
            urgencyCorrect: null,
            languageCorrect: null,
            zipCorrect: null,
            safetyPassed: null,
            referralsTotal: 0,
            referralsVerified: 0,
            referralsCallToConfirm: 0,
            referralsWithSource: 0,
            referralsUnsupported: 0,
            referralsRejected: 0,
            durationSeconds: 0,
            predictedDomains: [] as NeedDomain[],
            checks: [{ name: 'Error', passed: false, reason: errMsg }],
            error: errMsg,
          };
          passMap[tc.id] = {
            caseId: tc.id,
            inputUsed,
            inputFormat,
            inputLabel,
            careAgents: failedSide,
            singleCall: { ...failedSide },
          };
        }

        const snapshot = { ...passMap };
        setEvalCaseResults(snapshot);
        setEvalCompletedCount(
          (passNumber === 2 ? TEST_CASES.length : 0) + Object.keys(snapshot).length
        );
        setEvalMetrics(aggregateEvalMetrics(Object.values(snapshot)));
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
    if (!controller.signal.aborted && Object.keys(passMap).length === TEST_CASES.length) {
      handleRecordEvalRun(summarizeEvalRunForHistory(Object.values(passMap)));
    }
    return passMap;
  };

  const handleRunStressTest = async (signal?: AbortSignal) => {
    setIsRunningStressTest(true);
    setStressTestError(null);
    try {
      const res = await fetch('/api/eval/stress-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Stress test failed (${res.status})`);
      setStressTestResult(data as StressTestRunResponse);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStressTestError(err instanceof Error ? err.message : 'Stress test failed.');
      }
    } finally {
      setIsRunningStressTest(false);
    }
  };

  const handleRunFullEval = async (passes: 1 | 2) => {
    evalAbortRef.current?.abort();
    const controller = new AbortController();
    evalAbortRef.current = controller;

    setIsRunningEval(true);
    setRunningTwoPass(passes === 2);
    setCurrentEvalPass(1);
    setEvalError(null);
    setEvalCompletedCount(0);
    setEvalTotalSteps(passes * TEST_CASES.length);
    setConsistencySummary(null);
    setEvalCaseResults({});

    const startTime = Date.now();
    setEvalElapsedMs(0);
    if (evalTimerRef.current !== null) window.clearInterval(evalTimerRef.current);
    evalTimerRef.current = window.setInterval(() => {
      setEvalElapsedMs(Date.now() - startTime);
    }, 100);

    const mediaSnapshot = { ...loadedMedia };

    try {
      const pass1Results = await runSingleEvalPass(1, controller, mediaSnapshot);
      if (passes === 2 && !controller.signal.aborted) {
        setCurrentEvalPass(2);
        const pass2Results = await runSingleEvalPass(2, controller, mediaSnapshot, pass1Results);
        const evaluated = Object.values(pass2Results).filter(
          (r) => typeof r.consistentDomains === 'boolean'
        );
        const consistent = evaluated.filter((r) => r.consistentDomains).length;
        setConsistencySummary({ consistent, total: evaluated.length });
      }
      if (!controller.signal.aborted) {
        await handleRunStressTest(controller.signal);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setEvalError(err instanceof Error ? err.message : 'Eval run interrupted.');
      }
    } finally {
      if (evalTimerRef.current !== null) {
        window.clearInterval(evalTimerRef.current);
        evalTimerRef.current = null;
      }
      setIsRunningEval(false);
    }
  };

  const handleStopFullEval = () => {
    evalAbortRef.current?.abort();
    if (evalTimerRef.current !== null) {
      window.clearInterval(evalTimerRef.current);
      evalTimerRef.current = null;
    }
    setIsRunningEval(false);
  };

  const handleResetEvalState = () => {
    setEvalMetrics(DEFAULT_EVAL_METRICS);
    setEvalCaseResults({});
    setConsistencySummary(null);
    setStressTestResult(null);
    setStressTestError(null);
  };

  const handleRunTestCase = (testCase: TestCase) => {
    setDemoMode(false);
    setActiveTab('patient');
    setPatientStep(1);
    const media = loadedMedia[testCase.id];
    if (media) {
      setExternalRunRequest({
        mode: media.mode,
        fileData: media.dataUrl,
        mimeType: media.mimeType,
        fileName: media.fileName,
        nonce: Date.now(),
        autoRun: true,
      });
    } else {
      setExternalRunRequest({
        mode: 'text',
        text: testCase.text,
        nonce: Date.now(),
        autoRun: true,
      });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddSampleFollowUp = async () => {
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const formattedDate = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const sampleReferrals = [
      {
        name: 'New York Common Pantry, Choice Pantry (Bronx)',
        address: '1290 Hoe Ave, Bronx, NY 10459',
        hours: 'Thu to Sat, 10:00 AM to 2:00 PM',
        source_url: 'https://nycommonpantry.org/programs/nourish/',
      },
    ];
    const sampleConstraints = ['Works weekdays until 4:00 PM; available Saturdays'];

    if (demoMode) {
      handleCreateFollowUp(
        createDemoCompletedFollowUp({
          patientFirstName: 'Maria',
          referralName: sampleReferrals[0].name,
          referralAddress: sampleReferrals[0].address,
          referralHours: sampleReferrals[0].hours,
          referralUrl: sampleReferrals[0].source_url,
          language: 'Spanish',
          constraints: sampleConstraints,
          referrals: sampleReferrals,
        })
      );
      return;
    }

    let agentJobId: string | undefined;
    try {
      const res = await fetch('/api/followup/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientFirstName: 'Maria',
          language: 'Spanish',
          constraints: sampleConstraints,
          referrals: sampleReferrals,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { jobId?: string };
        agentJobId = data.jobId;
      }
    } catch {
      // Sample still created
    }

    handleCreateFollowUp({
      id: `fu-sample-${Date.now()}`,
      patientFirstName: 'Maria',
      referralName: sampleReferrals[0].name,
      referralAddress: sampleReferrals[0].address,
      referralHours: sampleReferrals[0].hours,
      referralUrl: sampleReferrals[0].source_url,
      referrals: sampleReferrals,
      constraints: sampleConstraints,
      language: 'Spanish',
      dueDateIso: dueDate.toISOString(),
      dueLabel: `Due in 3 days (${formattedDate})`,
      status: 'Scheduled',
      agentJobId,
      agentStatus: agentJobId ? 'Queued' : undefined,
      agentSteps: agentJobId
        ? [
            {
              id: 'queued',
              type: 'status',
              label: 'Queued Follow-up agent (Gemini Managed Agent)',
            },
          ]
        : undefined,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-[#0F172A]">
      <SystemBar
        patients={allChartPatients}
        demoMode={demoMode}
        onDemoModeChange={setDemoMode}
        onNewIntake={() => handleStartIntakeWithMode('text', true)}
        onSelectPatient={handleSelectPatient}
        onGoHome={() => setActiveTab('overview')}
      />

      <ActivityTabStrip
        activeTab={activeTab}
        onTabChange={setActiveTab}
        followUpCount={followUps.length}
        activePatientName={activePatient.name}
        evalRunningText={isRunningEval ? `${evalCompletedCount}/${evalTotalSteps}` : null}
      />

      <main className="flex-1 min-w-0">
        {activeTab === 'overview' ? (
          <OverviewTab
            sessionPatients={patients}
            followUps={followUps}
            onSelectPatient={handleSelectPatient}
            onStartIntake={(mode) => handleStartIntakeWithMode(mode, false)}
            onNavigateTab={setActiveTab}
            onRunAgentForTask={handleRunAgentForOverviewTask}
          />
        ) : null}

        {activeTab === 'patient' ? (
          <PatientWorkspace
            allPatients={allChartPatients}
            activePatient={activePatient}
            chart={activeChart}
            activeStep={patientStep}
            onStepChange={setPatientStep}
            onSelectPatientId={setSelectedPatientId}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onAddQuestionToOutreach={handleAddQuestionToOutreach}
            onUpdateOutreachDraft={handleUpdateActiveOutreachDraft}
            onApproveAndSend={handleApproveAndSendFromOutreach}
            onUpdateFollowUp={handleUpdateFollowUp}
            onIntakeCompleted={handleIntakeCompleted}
            onStartNewIntake={() => handleStartIntakeWithMode('text', true)}
            matchingFollowUps={activePatientFollowUps}
            externalRunRequest={externalRunRequest}
            demoMode={demoMode}
          />
        ) : null}

        {activeTab === 'resources' ? <ResourcesTab /> : null}

        {activeTab === 'followups' ? (
          <FollowUpsTab
            followUps={followUps}
            onUpdateFollowUp={handleUpdateFollowUp}
            onGoToIntake={() => handleStartIntakeWithMode('text', false)}
            onAddSampleFollowUp={() => void handleAddSampleFollowUp()}
            demoMode={demoMode}
          />
        ) : null}

        {activeTab === 'eval' ? (
          <EvalTab
            metrics={evalMetrics}
            onUpdateMetrics={setEvalMetrics}
            caseResults={evalCaseResults}
            runHistory={evalRunHistory}
            onClearRunHistory={handleClearRunHistory}
            loadedMedia={loadedMedia}
            onUpdateLoadedMedia={setLoadedMedia}
            failuresAndFixes={failuresAndFixes}
            onUpdateFailuresAndFixes={setFailuresAndFixes}
            onRunTestCase={handleRunTestCase}
            isRunningEval={isRunningEval}
            runningTwoPass={runningTwoPass}
            currentPass={currentEvalPass}
            completedCount={evalCompletedCount}
            totalSteps={evalTotalSteps}
            evalElapsedMs={evalElapsedMs}
            evalError={evalError}
            consistencySummary={consistencySummary}
            onStartEval={(passes) => void handleRunFullEval(passes)}
            onStopEval={handleStopFullEval}
            onResetDefaults={handleResetEvalState}
            stressTestResult={stressTestResult}
            isRunningStressTest={isRunningStressTest}
            stressTestError={stressTestError}
            onRunStressTest={() => void handleRunStressTest()}
          />
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 py-3 text-[12.5px] text-slate-500">
        <div className="mx-auto max-w-[1380px] flex flex-wrap items-center justify-between gap-2">
          <span>Romario Joseph · Care Agents</span>
          <span>Synthetic data only. Human approval required before outreach.</span>
        </div>
      </footer>
    </div>
  );
}
