import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Mic,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  DEMO_C01_RESULT,
  DEMO_C01_SINGLE_CALL,
  DEMO_C01_TEXT,
  DEMO_SPANISH_VOICE_SCRIPT,
  TEST_CASES,
} from '../data/resources.ts';
import type {
  FollowUpItem,
  InputMode,
  IntakeExtraction,
  PatientRecord,
  PatientStep,
  PipelineResult,
  ReferralItem,
  SingleCallResult,
  TimelineStep,
} from '../types.ts';
import type { DerivedPatientChart, MissingQuestionPrompt } from '../utils/patientChart.ts';
import { ChartAlertBar } from './ChartAlertBar.tsx';
import { ModelTracePanel } from './ModelTracePanel.tsx';
import { PatientStoryboard } from './PatientStoryboard.tsx';
import { VoiceRecorder } from './VoiceRecorder.tsx';

export interface ExternalRunPayload {
  mode: InputMode;
  text?: string;
  fileData?: string;
  mimeType?: string;
  fileName?: string;
  nonce: number;
  autoRun: boolean;
  clearResult?: boolean;
}

interface PatientWorkspaceProps {
  allPatients: PatientRecord[];
  activePatient: PatientRecord;
  chart: DerivedPatientChart;
  activeStep: PatientStep;
  onStepChange: (step: PatientStep) => void;
  onSelectPatientId: (id: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onAddQuestionToOutreach: (prompt: MissingQuestionPrompt) => void;
  onUpdateOutreachDraft: (draft: string) => void;
  onApproveAndSend: (patient: PatientRecord, draft: string) => Promise<void>;
  onUpdateFollowUp: (id: string, patch: Partial<FollowUpItem>) => void;
  onIntakeCompleted: (result: PipelineResult, mode: InputMode) => void;
  onStartNewIntake: () => void;
  matchingFollowUps: FollowUpItem[];
  externalRunRequest: ExternalRunPayload | null;
  demoMode: boolean;
}

const STEP_ITEMS: Array<{ step: PatientStep; label: string }> = [
  { step: 1, label: '1 Intake' },
  { step: 2, label: '2 Needs' },
  { step: 3, label: '3 Referrals' },
  { step: 4, label: '4 Send and follow up' },
];

const DOMAIN_LABELS: Record<string, string> = {
  food: 'Food',
  housing: 'Housing',
  utilities: 'Utilities',
  clinic: 'Clinic',
  transport: 'Transport',
  benefits: 'Benefits',
  other: 'Other',
};

function isSafeHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPhysicalAddress(address: string): boolean {
  const lower = address.toLowerCase().trim();
  if (!lower || lower === 'address not listed') return false;
  if (
    lower.startsWith('online') ||
    lower.startsWith('virtual') ||
    lower.startsWith('access hra') ||
    lower.startsWith('coned.com')
  ) {
    return false;
  }
  return /\d+/.test(address);
}

function buildGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function UrgencyPill({ urgency }: { urgency: 1 | 2 | 3 }) {
  if (urgency === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#C53030] whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-[#C53030]" />
        Urgent
      </span>
    );
  }
  if (urgency === 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#D97706] whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-[#D97706]" />
        This week
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#64748B] whitespace-nowrap">
      <span className="h-2 w-2 rounded-full bg-[#64748B]" />
      Routine
    </span>
  );
}

function ReferralStatusLabel({ referral }: { referral: ReferralItem }) {
  if (referral.checking_live) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2B6CB0] whitespace-nowrap">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking
      </span>
    );
  }
  const isVerified =
    referral.verification_outcome === 'verified' ||
    (referral.verified &&
      !referral.not_verified_live &&
      referral.verification_outcome !== 'call_to_confirm');
  if (referral.verification_outcome === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#C53030] whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-[#C53030]" />
        Rejected
      </span>
    );
  }
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#15803D] whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-[#15803D]" />
        {referral.hours_corrected ? 'Hours updated' : 'Verified today'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#D97706] whitespace-nowrap">
      <span className="h-2 w-2 rounded-full bg-[#D97706]" />
      Call to confirm
    </span>
  );
}

export const PatientWorkspace: React.FC<PatientWorkspaceProps> = ({
  allPatients,
  activePatient,
  chart,
  activeStep,
  onStepChange,
  onSelectPatientId,
  onAcknowledgeAlert,
  onAddQuestionToOutreach,
  onUpdateOutreachDraft,
  onApproveAndSend,
  onUpdateFollowUp,
  onIntakeCompleted,
  onStartNewIntake,
  matchingFollowUps,
  externalRunRequest,
  demoMode,
}) => {
  // Step 1 Intake Input State
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState<string>(DEMO_C01_TEXT);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('');
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Live Run State
  const [isRunning, setIsRunning] = useState(false);
  const [isPreparingSample, setIsPreparingSample] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<Array<TimelineStep & { elapsedLabel?: string }>>([]);

  // Camera Modal State
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);

  // Step 2 Needs State
  const [expandedNeedIds, setExpandedNeedIds] = useState<Record<string, boolean>>({});
  const [addedQuestionDomains, setAddedQuestionDomains] = useState<Record<string, boolean>>({});

  // Step 3 Referrals State
  const [expandedReferralIds, setExpandedReferralIds] = useState<Record<string, boolean>>({});
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<SingleCallResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Step 4 Outreach & Follow-up State
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isSynthesizingAudio, setIsSynthesizingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [step4DetailsOpen, setStep4DetailsOpen] = useState(false);
  const [expandedAgentStepIds, setExpandedAgentStepIds] = useState<Record<string, boolean>>({});
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const snapInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const demoTimersRef = useRef<number[]>([]);
  const elapsedTimerRef = useRef<number | null>(null);
  const runStartMsRef = useRef<number>(Date.now());
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const clearDemoTimers = () => {
    demoTimersRef.current.forEach((t) => window.clearTimeout(t));
    demoTimersRef.current = [];
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const startElapsedTimer = () => {
    stopElapsedTimer();
    const start = Date.now();
    runStartMsRef.current = start;
    setElapsedMs(0);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraStreamActive(false);
  };

  useEffect(() => {
    return () => {
      clearDemoTimers();
      stopElapsedTimer();
      stopCameraStream();
      abortRef.current?.abort();
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!externalRunRequest) return;
    setErrorMsg(null);
    setCompareResult(null);
    setCompareError(null);
    if (externalRunRequest.clearResult) {
      setLiveTimeline([]);
    }

    if (externalRunRequest.mode === 'photo') {
      setInputMode('photo');
      if (externalRunRequest.fileData) {
        setPhotoDataUrl(externalRunRequest.fileData);
        setPhotoMimeType(externalRunRequest.mimeType || 'image/jpeg');
        setPhotoName(externalRunRequest.fileName || 'Intake photo');
        if (externalRunRequest.autoRun) {
          void executePipeline({
            mode: 'photo',
            fileData: externalRunRequest.fileData,
            mimeType: externalRunRequest.mimeType || 'image/jpeg',
            forceLive: true,
          });
        }
      }
    } else if (externalRunRequest.mode === 'voice') {
      setInputMode('voice');
      if (externalRunRequest.fileData) {
        setAudioDataUrl(externalRunRequest.fileData);
        setAudioMimeType(externalRunRequest.mimeType || 'audio/mp4');
        if (externalRunRequest.autoRun) {
          void executePipeline({
            mode: 'voice',
            fileData: externalRunRequest.fileData,
            mimeType: externalRunRequest.mimeType || 'audio/mp4',
            forceLive: true,
          });
        }
      }
    } else {
      setInputMode('text');
      if (externalRunRequest.text !== undefined) {
        setTextInput(externalRunRequest.text);
        if (externalRunRequest.autoRun) {
          void executePipeline({
            mode: 'text',
            text: externalRunRequest.text,
            forceLive: true,
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRunRequest]);

  const upsertTimelineStep = (step: TimelineStep) => {
    const elapsedSec = ((Date.now() - runStartMsRef.current) / 1000).toFixed(1);
    setLiveTimeline((prev) => {
      const idx = prev.findIndex((s) => s.id === step.id);
      const stamped = { ...step, elapsedLabel: `${elapsedSec}s` };
      if (idx === -1) return [...prev, stamped];
      const next = [...prev];
      next[idx] = stamped;
      return next;
    });
  };

  const handlePhotoFile = (file: File | undefined, autoRunAfterLoad: boolean = false) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    setErrorMsg(null);
    setInputMode('photo');
    setPhotoName(file.name);
    setPhotoMimeType(file.type);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setPhotoDataUrl(dataUrl);
        if (autoRunAfterLoad) {
          void executePipeline({
            mode: 'photo',
            fileData: dataUrl,
            mimeType: file.type,
            forceLive: !demoMode,
          });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const openSnapCamera = async () => {
    setCameraError(null);
    setCameraOpen(true);
    stopCameraStream();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Live camera preview is unavailable. Choose a photo below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraStreamActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError('Camera access denied. Choose or snap a photo below.');
    }
  };

  const closeSnapCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  };

  const handleCaptureAndRun = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    closeSnapCamera();
    setInputMode('photo');
    setPhotoDataUrl(dataUrl);
    setPhotoMimeType('image/jpeg');
    setPhotoName(`form-snap-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`);
    void executePipeline({
      mode: 'photo',
      fileData: dataUrl,
      mimeType: 'image/jpeg',
      forceLive: !demoMode,
    });
  };

  const runDemoPlayback = () => {
    clearDemoTimers();
    startElapsedTimer();
    setIsRunning(true);
    setErrorMsg(null);
    setCompareResult(null);
    setCompareError(null);
    setLiveTimeline([
      {
        id: 'read',
        label: 'Reading intake with Gemini 4 Hydrogen (Demo mode)...',
        status: 'active',
        elapsedLabel: '0.0s',
      },
    ]);

    const t1 = window.setTimeout(() => {
      upsertTimelineStep({ id: 'read', label: 'Extracted 3 needs near 10459', status: 'done' });
      upsertTimelineStep({
        id: 'verify',
        label: 'Checking NYC resources and live pages...',
        status: 'active',
      });
    }, 450);

    const t2 = window.setTimeout(() => {
      upsertTimelineStep({ id: 'verify', label: 'Verified local referrals', status: 'done' });
      upsertTimelineStep({
        id: 'outreach',
        label: 'Drafting Spanish outreach message...',
        status: 'active',
      });
    }, 1050);

    const t3 = window.setTimeout(() => {
      upsertTimelineStep({ id: 'outreach', label: 'Drafted outreach message', status: 'done' });
      stopElapsedTimer();
      setIsRunning(false);
      onIntakeCompleted(DEMO_C01_RESULT, inputMode);
      onStepChange(2);
    }, 1550);

    demoTimersRef.current = [t1, t2, t3];
  };

  const executePipeline = async (opts?: {
    mode?: InputMode;
    text?: string;
    fileData?: string;
    mimeType?: string;
    forceLive?: boolean;
  }) => {
    const activeMode = opts?.mode ?? inputMode;
    const activeText = opts?.text ?? textInput;
    const activeFileData =
      opts?.fileData ??
      (activeMode === 'photo' ? photoDataUrl : activeMode === 'voice' ? audioDataUrl : undefined);
    const activeMimeType =
      opts?.mimeType ??
      (activeMode === 'photo'
        ? photoMimeType
        : activeMode === 'voice'
          ? audioMimeType
          : undefined);

    if (demoMode && !opts?.forceLive) {
      if (activeMode === 'text' && !activeText.trim()) setTextInput(DEMO_C01_TEXT);
      runDemoPlayback();
      return;
    }

    if (activeMode === 'text' && !activeText.trim()) {
      setErrorMsg('Enter patient intake notes before running.');
      return;
    }
    if (activeMode === 'photo' && !activeFileData) {
      setErrorMsg('Upload a form photo first.');
      return;
    }
    if (activeMode === 'voice' && !activeFileData) {
      setErrorMsg('Record or upload a voice note first.');
      return;
    }

    clearDemoTimers();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    startElapsedTimer();
    setIsRunning(true);
    setErrorMsg(null);
    setCompareResult(null);
    setCompareError(null);
    setLiveTimeline([]);

    try {
      const response = await fetch('/api/intake/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: activeMode,
          text: activeMode === 'text' ? activeText : undefined,
          fileData: activeMode !== 'text' ? activeFileData : undefined,
          mimeType: activeMode !== 'text' ? activeMimeType : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        throw new Error(errText || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;

          const parsed = JSON.parse(dataLine);
          if (eventName === 'status') {
            upsertTimelineStep(parsed as TimelineStep);
          } else if (eventName === 'intake') {
            const _intake = parsed as IntakeExtraction;
            if (_intake.needs.length > 0) {
              upsertTimelineStep({
                id: 'intake_ready',
                label: `Extracted ${_intake.needs.length} needs (${_intake.language || 'English'})`,
                status: 'done',
              });
            }
          } else if (eventName === 'done') {
            const donePayload = parsed as PipelineResult;
            onIntakeCompleted(donePayload, activeMode);
            onStepChange(2);
          } else if (eventName === 'error') {
            throw new Error((parsed as { message?: string }).message || 'Pipeline failed.');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to process intake.');
      }
    } finally {
      stopElapsedTimer();
      setIsRunning(false);
    }
  };

  const handleSampleSpanishVoice = async () => {
    if (demoMode) {
      setInputMode('text');
      setTextInput(DEMO_C01_TEXT);
      runDemoPlayback();
      return;
    }
    setIsPreparingSample(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: DEMO_SPANISH_VOICE_SCRIPT, language: 'Spanish' }),
      });
      const data = await res.json();
      if (res.ok && data.audioBase64) {
        const dataUrl = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
        setInputMode('voice');
        setAudioDataUrl(dataUrl);
        setAudioMimeType('audio/wav');
        setIsPreparingSample(false);
        void executePipeline({
          mode: 'voice',
          fileData: dataUrl,
          mimeType: 'audio/wav',
          forceLive: true,
        });
        return;
      }
    } catch {
      // Fallback to text
    }
    setIsPreparingSample(false);
    setInputMode('text');
    setTextInput(DEMO_SPANISH_VOICE_SCRIPT);
    void executePipeline({ mode: 'text', text: DEMO_SPANISH_VOICE_SCRIPT, forceLive: true });
  };

  const handleCompareSingleCall = async () => {
    if (demoMode) {
      setCompareResult(DEMO_C01_SINGLE_CALL);
      return;
    }
    setIsComparing(true);
    setCompareError(null);
    try {
      const compareText =
        textInput.trim() ||
        activePatient.result.intake.needs.map((n) => `${n.domain}: ${n.summary}`).join('. ');
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text',
          text: compareText,
          constraints: activePatient.result.intake.constraints,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed.');
      setCompareResult(data as SingleCallResult);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  const draft = activePatient.result.outreachDraft || '';
  const targetLang =
    activePatient.result.intake.language &&
    activePatient.result.intake.language.toLowerCase() !== 'unknown'
      ? activePatient.result.intake.language
      : 'English';

  const handlePlayAloud = async () => {
    if (isPlayingAudio) {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }
    if (!draft.trim()) return;
    setTtsError(null);

    if (demoMode) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(draft);
          utterance.lang = targetLang.toLowerCase().includes('span') ? 'es-US' : 'en-US';
          utterance.onend = () => setIsPlayingAudio(false);
          utterance.onerror = () => setIsPlayingAudio(false);
          setIsPlayingAudio(true);
          window.speechSynthesis.speak(utterance);
          return;
        } catch {
          setIsPlayingAudio(false);
        }
      }
      setTtsError('Browser voice unavailable in Demo mode.');
      return;
    }

    setIsSynthesizingAudio(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, language: targetLang }),
      });
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Could not generate audio.');
      }
      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      ttsAudioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        setTtsError('Audio playback failed.');
      };
      await audio.play();
      setIsPlayingAudio(true);
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Audio failed.');
    } finally {
      setIsSynthesizingAudio(false);
    }
  };

  const handleApproveClick = async () => {
    if (!draft.trim()) return;
    setApproving(true);
    setApproveError(null);
    try {
      await onApproveAndSend(activePatient, draft);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Could not start follow-up agent.');
    } finally {
      setApproving(false);
    }
  };

  const handleCheckAgain = async (item: FollowUpItem) => {
    setRecheckError(null);
    if (demoMode) {
      onUpdateFollowUp(item.id, {
        agentStatus: 'Done',
        status: 'Verified open',
        lastCheckedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        agentSteps: [
          ...(item.agentSteps || []),
          {
            id: `demo-recheck-${Date.now()}`,
            type: 'result',
            label: 'Re-checked in Demo mode',
            detail: `${item.referralName} hours confirmed active.`,
          },
        ],
      });
      return;
    }

    const referralsPayload =
      item.referrals && item.referrals.length > 0
        ? item.referrals
        : [
            {
              name: item.referralName,
              address: item.referralAddress,
              hours: item.referralHours,
              source_url: item.referralUrl,
            },
          ];

    try {
      const res = await fetch('/api/followup/agent/check-again', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientFirstName: item.patientFirstName,
          language: item.language,
          constraints: item.constraints || [],
          referrals: referralsPayload,
          previousInteractionId: item.interactionId,
          environmentId: item.environmentId,
        }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || 'Could not start Check again.');
      }
      onUpdateFollowUp(item.id, {
        agentJobId: data.jobId,
        agentStatus: 'Queued',
        agentError: undefined,
        usedFallback: false,
        checkInApproved: false,
        agentSteps: [
          {
            id: 'queued',
            type: 'status',
            label: 'Queued Check again in Managed Agent session',
          },
        ],
      });
    } catch (err) {
      setRecheckError(err instanceof Error ? err.message : 'Check again failed.');
    }
  };

  const { intake, verifiedReferrals, rejectedReferrals } = activePatient.result;
  const verifiedTodayCount = verifiedReferrals.filter(
    (r) =>
      r.verification_outcome === 'verified' ||
      (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm')
  ).length;
  const callToConfirmCount = verifiedReferrals.length - verifiedTodayCount;
  const rejectedCount = rejectedReferrals.length;

  return (
    <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 py-6 overflow-x-clip">
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full min-w-0">
        <PatientStoryboard
          allPatients={allPatients}
          activePatient={activePatient}
          chart={chart}
          onSelectPatientId={onSelectPatientId}
          onStartNewIntake={onStartNewIntake}
        />

        <div className="flex-1 min-w-0 w-full max-w-full space-y-6">
          {/* 4-Step Clickable Stepper */}
          <nav aria-label="Patient workflow steps" className="calm-card p-2">
            <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STEP_ITEMS.map(({ step, label }) => {
                const isActive = activeStep === step;
                const isDone =
                  (step === 1 && intake.needs.length > 0 && activeStep > 1) ||
                  (step === 2 && intake.needs.length > 0 && activeStep > 2) ||
                  (step === 3 && verifiedReferrals.length > 0 && activeStep > 3) ||
                  (step === 4 && Boolean(activePatient.outreachApproved));

                return (
                  <li key={step}>
                    <button
                      type="button"
                      onClick={() => onStepChange(step)}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold whitespace-nowrap ${
                        isActive
                          ? 'bg-[#1F3A5F] text-white'
                          : isDone
                            ? 'bg-slate-50 text-[#1F3A5F] hover:bg-slate-100'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {isDone && !isActive ? (
                        <Check className="h-4 w-4 text-[#15803D] shrink-0" />
                      ) : null}
                      <span>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Slim 1-Line Alert Bar */}
          <ChartAlertBar
            alerts={chart.alerts}
            acknowledgedIds={activePatient.acknowledgedAlertIds || []}
            onAcknowledge={onAcknowledgeAlert}
          />

          {/* STEP 1: INTAKE */}
          {activeStep === 1 ? (
            <div className="space-y-6">
              <section className="calm-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    {(
                      [
                        { id: 'photo' as const, label: 'Photo', icon: Camera },
                        { id: 'voice' as const, label: 'Voice', icon: Mic },
                        { id: 'text' as const, label: 'Text', icon: FileText },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon;
                      const active = inputMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setInputMode(m.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold ${
                            active
                              ? 'bg-[#2B6CB0] text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={snapInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        handlePhotoFile(e.target.files?.[0], true);
                        closeSnapCamera();
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => void openSnapCamera()}
                      disabled={isRunning || isPreparingSample}
                      className="ehr-btn-secondary"
                    >
                      <Camera className="h-4 w-4 text-[#2B6CB0]" />
                      Snap a form
                    </button>
                    {inputMode === 'text' && textInput ? (
                      <button
                        type="button"
                        onClick={() => setTextInput('')}
                        className="ehr-btn-secondary"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {inputMode === 'photo' ? (
                    <div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                        className="hidden"
                      />
                      {!photoDataUrl ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                          }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            handlePhotoFile(e.dataTransfer.files?.[0]);
                          }}
                          onClick={() => photoInputRef.current?.click()}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              photoInputRef.current?.click();
                            }
                          }}
                          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${
                            isDragging
                              ? 'border-[#2B6CB0] bg-blue-50/40'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <Upload className="h-6 w-6 text-slate-400" />
                          <p className="mt-2 text-[14px] font-semibold text-slate-800">
                            Drop an intake photo or click to upload
                          </p>
                          <p className="mt-0.5 text-[13px] text-slate-500">JPG, PNG, or WebP</p>
                        </div>
                      ) : (
                        <div className="soft-surface p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-slate-800">
                              {photoName || 'Intake photo'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoDataUrl(null);
                                setPhotoMimeType(null);
                                setPhotoName('');
                              }}
                              className="ehr-btn-secondary py-1 px-2.5 text-[12.5px]"
                            >
                              <X className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                          <img
                            src={photoDataUrl}
                            alt="Uploaded intake form"
                            referrerPolicy="no-referrer"
                            className="max-h-72 w-full rounded-lg object-contain bg-white border border-slate-200"
                          />
                        </div>
                      )}
                    </div>
                  ) : null}

                  {inputMode === 'voice' ? (
                    <VoiceRecorder
                      audioDataUrl={audioDataUrl}
                      audioMimeType={audioMimeType}
                      onAudioChange={(url, mime) => {
                        setAudioDataUrl(url);
                        setAudioMimeType(mime);
                      }}
                    />
                  ) : null}

                  {inputMode === 'text' ? (
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      rows={5}
                      placeholder="Paste or type patient intake notes..."
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#2B6CB0] focus:outline-none"
                    />
                  ) : null}

                  {errorMsg ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3 text-[13.5px] text-[#C53030]">
                      <span>{errorMsg}</span>
                      <button
                        type="button"
                        onClick={() => void executePipeline()}
                        className="ehr-btn-secondary py-1 px-3 text-[12.5px]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-slate-500 mr-1">
                        Try sample:
                      </span>
                      <button
                        type="button"
                        disabled={isRunning || isPreparingSample}
                        onClick={() => {
                          setInputMode('text');
                          setTextInput(DEMO_C01_TEXT);
                          void executePipeline({ mode: 'text', text: DEMO_C01_TEXT });
                        }}
                        className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                      >
                        Messy note
                      </button>
                      <button
                        type="button"
                        disabled={isRunning || isPreparingSample}
                        onClick={() => void handleSampleSpanishVoice()}
                        className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                      >
                        {isPreparingSample ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          'Spanish voice'
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isRunning || isPreparingSample}
                        onClick={() => {
                          const c09 =
                            TEST_CASES.find((t) => t.id === 'C09')?.text ||
                            'dx diabetes, asks what dose of metformin to take, also needs food';
                          setInputMode('text');
                          setTextInput(c09);
                          if (demoMode) {
                            runDemoPlayback();
                          } else {
                            void executePipeline({ mode: 'text', text: c09, forceLive: true });
                          }
                        }}
                        className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                      >
                        Tricky case
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      {isRunning ? (
                        <span className="font-mono text-[13px] font-semibold text-slate-600 tabular-nums">
                          {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void executePipeline()}
                        disabled={isRunning || isPreparingSample}
                        className="ehr-btn-primary px-5 py-2.5"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 fill-current" />
                            Run
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Live Progress */}
              {liveTimeline.length > 0 ? (
                <section className="calm-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[15px] font-semibold text-slate-900">Live progress</h2>
                    <span className="font-mono text-[13px] text-slate-500 tabular-nums">
                      {isRunning
                        ? `${(elapsedMs / 1000).toFixed(1)}s`
                        : activePatient.result.durationSeconds
                          ? `${activePatient.result.durationSeconds.toFixed(1)}s`
                          : ''}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {liveTimeline.map((step) => (
                      <li
                        key={step.id}
                        className="flex items-center justify-between gap-3 py-2 text-[13.5px]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {step.status === 'active' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#2B6CB0] shrink-0" />
                          ) : step.status === 'warning' ? (
                            <AlertTriangle className="h-4 w-4 text-[#D97706] shrink-0" />
                          ) : (
                            <Check className="h-4 w-4 text-[#15803D] shrink-0" />
                          )}
                          <span className="text-slate-800 truncate">{step.label}</span>
                        </div>
                        {step.elapsedLabel ? (
                          <span className="font-mono text-[12px] text-slate-400 tabular-nums shrink-0">
                            {step.elapsedLabel}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {/* STEP 2: NEEDS + SDOH GRID */}
          {activeStep === 2 ? (
            <div className="space-y-6">
              {/* Safety / Background Carbon Notices */}
              {intake.prompt_injection_detected ? (
                <div className="calm-card border-red-200 bg-red-50 p-4 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-[#C53030] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#C53030]">Unsafe instruction blocked</div>
                    <p className="text-[13.5px] text-red-900">
                      {intake.prompt_injection_reason || 'Prompt override ignored; 0 needs extracted.'}
                    </p>
                  </div>
                </div>
              ) : null}

              {intake.medical_advice_requested ? (
                <div className="calm-card border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-amber-950">Medical advice request flagged</div>
                    <p className="text-[13.5px] text-amber-900">
                      No dosing or clinical advice generated. Escalate to a clinician or nurse.
                    </p>
                  </div>
                </div>
              ) : null}

              {activePatient.result.carbonPending ? (
                <div className="calm-card px-4 py-3 flex items-center gap-2.5 text-[13.5px] text-[#1F3A5F]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2B6CB0]" />
                  <span>Gemini 4 Carbon is double-checking needs in the background...</span>
                </div>
              ) : null}

              {/* Extracted Needs Cards */}
              <section className="space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="calm-heading">Extracted needs</h2>
                  <span className="text-[13px] text-slate-500 tabular-nums">
                    {intake.needs.length} {intake.needs.length === 1 ? 'need' : 'needs'}
                  </span>
                </div>

                {intake.needs.length === 0 ? (
                  <div className="calm-card p-6 text-[14px] text-slate-600">
                    No actionable needs were extracted from this intake.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 min-w-0">
                    {intake.needs.map((need) => {
                      const open = Boolean(expandedNeedIds[need.id]);
                      return (
                        <div key={need.id} className="calm-card p-4 min-w-0 w-full overflow-hidden">
                          <div className="flex items-start justify-between gap-3 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <h3 className="text-[16px] font-semibold text-slate-900 break-words">
                                  {DOMAIN_LABELS[need.domain] || need.domain}
                                </h3>
                                <UrgencyPill urgency={need.urgency} />
                                {need.updatedByCarbon ? (
                                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-[#2B6CB0]">
                                    Updated by Gemini 4 Carbon
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-[14px] text-slate-600 break-words">
                                {need.summary}
                              </p>
                            </div>

                            {need.evidence_quote ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedNeedIds((prev) => ({ ...prev, [need.id]: !prev[need.id] }))
                                }
                                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0] hover:underline shrink-0"
                              >
                                {open ? 'Hide' : 'Details'}
                                {open ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>

                          {open && need.evidence_quote ? (
                            <div className="mt-3 border-t border-slate-100 pt-3 text-[13.5px] text-slate-700 break-words">
                              <span className="font-semibold text-slate-900">Quote: </span>
                              &ldquo;{need.evidence_quote}&rdquo;
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {intake.unclear.length > 0 ? (
                  <div className="soft-surface px-4 py-3 text-[13.5px] text-slate-700 break-words">
                    <span className="font-semibold text-slate-900">Not added (unclear): </span>
                    {intake.unclear.join(' · ')}
                  </div>
                ) : null}
              </section>

              {/* SDOH Screening Grid */}
              <section className="calm-card overflow-hidden min-w-0 w-full">
                <div className="ehr-section-header flex-wrap">
                  <span>SDOH screening</span>
                  <span className="text-[13px] font-normal text-slate-500">
                    {chart.completeCount} documented · {chart.unclearCount + chart.notAskedCount} to confirm
                  </span>
                </div>
                <div className="w-full min-w-0">
                  <table className="ehr-table table-fixed w-full">
                    <colgroup>
                      <col className="w-[144px]" />
                      <col className="w-[104px]" />
                      <col />
                      <col className="w-[118px]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Domain</th>
                        <th>Status</th>
                        <th>Note</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chart.sdohRows.map((row) => {
                        const askPrompt =
                          row.askPrompt ||
                          chart.askQuestions.find((q) => q.domain === row.domain);
                        const added = Boolean(askPrompt && addedQuestionDomains[askPrompt.domain]);

                        const statusColor =
                          row.status === 'Positive'
                            ? 'text-[#C53030]'
                            : row.status === 'Unclear'
                              ? 'text-[#D97706]'
                              : row.status === 'Documented' || row.status === 'Attribute'
                                ? 'text-[#15803D]'
                                : 'text-slate-500';

                        return (
                          <tr key={row.domain}>
                            <td className="font-semibold text-slate-900 break-words align-top">
                              {row.domain}
                            </td>
                            <td className={`font-semibold text-[13px] whitespace-nowrap align-top ${statusColor}`}>
                              {row.status}
                            </td>
                            <td className="text-[13.5px] text-slate-600 break-words whitespace-normal align-top">
                              {row.answer}
                            </td>
                            <td className="text-right align-top">
                              {askPrompt ? (
                                <button
                                  type="button"
                                  disabled={added}
                                  onClick={() => {
                                    onAddQuestionToOutreach(askPrompt);
                                    setAddedQuestionDomains((prev) => ({
                                      ...prev,
                                      [askPrompt.domain]: true,
                                    }));
                                  }}
                                  className="ehr-btn-secondary py-1 px-2.5 text-[12.5px] whitespace-nowrap"
                                >
                                  {added ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-[#15803D]" />
                                      Added
                                    </>
                                  ) : (
                                    'Ask patient'
                                  )}
                                </button>
                              ) : (
                                <span className="text-[12.5px] text-slate-400">Screened</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Single Bottom Primary CTA */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => onStepChange(3)}
                  className="ehr-btn-primary px-6 py-2.5"
                >
                  Looks right, find services
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 3: REFERRALS */}
          {activeStep === 3 ? (
            <div className="space-y-6 min-w-0 w-full">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="calm-heading">Referrals</h2>
                  <p className="mt-0.5 text-[14px] text-slate-600 tabular-nums">
                    {verifiedTodayCount} verified, {callToConfirmCount} call to confirm, {rejectedCount} rejected
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isComparing}
                  onClick={() => void handleCompareSingleCall()}
                  className="ehr-btn-secondary shrink-0"
                >
                  {isComparing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    'Compare baseline'
                  )}
                </button>
              </div>

              {compareError ? (
                <div className="calm-card border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-[#C53030] break-words">
                  {compareError}
                </div>
              ) : null}

              {verifiedReferrals.length === 0 ? (
                <div className="calm-card p-6 text-[14px] text-slate-600">
                  No referrals available for this intake yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 min-w-0">
                  {verifiedReferrals.map((ref) => {
                    const open = Boolean(expandedReferralIds[ref.id]);
                    const hasSource = isSafeHttpUrl(ref.source_url);
                    const hasDataset = isSafeHttpUrl(ref.dataset_url);
                    const hasMaps = isPhysicalAddress(ref.address);

                    return (
                      <div key={ref.id} className="calm-card p-4 min-w-0 w-full overflow-hidden">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                              <span className="text-[12px] font-semibold uppercase tracking-wide text-[#2B6CB0] shrink-0">
                                {DOMAIN_LABELS[ref.domain] || ref.domain}
                              </span>
                              <h3 className="text-[16px] font-semibold text-slate-900 leading-snug break-words min-w-0">
                                {ref.name}
                              </h3>
                              <ReferralStatusLabel referral={ref} />
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-slate-600 min-w-0">
                              <span
                                className="inline-block max-w-full sm:max-w-[340px] lg:max-w-[380px] truncate align-bottom"
                                title={ref.address}
                              >
                                {ref.address}
                              </span>
                              <span className="text-slate-300 shrink-0" aria-hidden="true">
                                ·
                              </span>
                              <span className="break-words min-w-0">{ref.hours}</span>
                              {ref.phone && ref.phone !== 'Not listed' ? (
                                <>
                                  <span className="text-slate-300 shrink-0" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="font-mono text-[13px] text-slate-700 whitespace-nowrap">
                                    {ref.phone}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReferralIds((prev) => ({ ...prev, [ref.id]: !prev[ref.id] }))
                            }
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0] hover:underline shrink-0"
                          >
                            {open ? 'Hide' : 'Details'}
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {open ? (
                          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3 text-[13.5px] min-w-0">
                            {ref.why_matches ? (
                              <p className="text-slate-700 break-words">{ref.why_matches}</p>
                            ) : null}

                            {ref.verification_note ? (
                              <div className="text-slate-600 break-words">
                                <span className="font-semibold text-slate-900">Check result: </span>
                                {ref.verification_note}
                              </div>
                            ) : null}

                            {ref.evidence_quote ? (
                              <div className="soft-surface px-3.5 py-2.5 text-slate-700 break-words">
                                <span className="font-semibold text-slate-900">Evidence quote: </span>
                                &ldquo;{ref.evidence_quote}&rdquo;
                              </div>
                            ) : null}

                            {ref.checks ? (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-700">
                                <span>Hours: {ref.checks.hours ? 'Confirmed' : 'Call first'}</span>
                                <span>Address: {ref.checks.address ? 'Confirmed' : 'Call first'}</span>
                                <span>
                                  Schedule: {ref.checks.open_on_available_days ? 'Matches' : 'Conflict'}
                                </span>
                                {ref.eligibility ? (
                                  <span className="break-words">Eligibility: {ref.eligibility}</span>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-4 pt-1">
                              {hasSource ? (
                                <a
                                  href={ref.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[#2B6CB0] hover:underline"
                                >
                                  Source
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {hasDataset ? (
                                <a
                                  href={ref.dataset_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[#2B6CB0] hover:underline"
                                >
                                  NYC Open Data
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {hasMaps ? (
                                <a
                                  href={buildGoogleMapsUrl(ref.address)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[#2B6CB0] hover:underline"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                  Directions
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rejected Referrals Toggle */}
              {rejectedReferrals.length > 0 ? (
                <div className="calm-card overflow-hidden min-w-0 w-full">
                  <button
                    type="button"
                    onClick={() => setRejectedOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="text-[14px] font-semibold text-[#C53030]">
                      Filtered out by self-check ({rejectedReferrals.length})
                    </span>
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0] shrink-0">
                      {rejectedOpen ? 'Hide' : 'Details'}
                      {rejectedOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {rejectedOpen ? (
                    <div className="border-t border-slate-200 divide-y divide-slate-100">
                      {rejectedReferrals.map((ref) => (
                        <div key={ref.id} className="px-4 py-3 text-[13.5px] min-w-0 break-words">
                          <div className="font-semibold text-slate-900 break-words">{ref.name}</div>
                          <div className="text-[#C53030] break-words">
                            {ref.rejection_reason || ref.verification_note}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Single-call Baseline Comparison */}
              {compareResult ? (
                <section className="calm-card overflow-hidden min-w-0 w-full">
                  <div className="ehr-section-header">
                    <span>Single-call baseline ({compareResult.durationSeconds}s)</span>
                    <button
                      type="button"
                      onClick={() => setCompareResult(null)}
                      className="text-[13px] font-medium text-slate-500 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {compareResult.referrals.map((item, idx) => (
                      <div key={idx} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 break-words">{item.name}</div>
                          <div className="text-[13px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                            <span
                              className="inline-block max-w-full sm:max-w-[320px] truncate"
                              title={item.address}
                            >
                              {item.address}
                            </span>
                            <span className="text-slate-300" aria-hidden="true">·</span>
                            <span className="break-words">{item.hours}</span>
                          </div>
                        </div>
                        <span
                          className={`text-[12.5px] font-semibold shrink-0 ${
                            item.rejected ? 'text-[#C53030]' : 'text-[#15803D]'
                          }`}
                        >
                          {item.rejected ? item.issues[0] || 'Unverified' : 'Supported'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Single Bottom Primary CTA */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => onStepChange(4)}
                  className="ehr-btn-primary px-6 py-2.5"
                >
                  Approve referrals
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 4: SEND AND FOLLOW UP */}
          {activeStep === 4 ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-12 items-start">
                {/* Left: Message Editor */}
                <section className="lg:col-span-7 calm-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[16px] font-semibold text-slate-900">
                      Outreach draft ({targetLang})
                    </h2>
                    <span className="font-mono text-[12.5px] text-slate-500 tabular-nums">
                      {draft.length} chars
                    </span>
                  </div>

                  <textarea
                    rows={6}
                    value={draft}
                    onChange={(e) => onUpdateOutreachDraft(e.target.value)}
                    placeholder="Outreach message draft..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
                  />

                  {ttsError ? <p className="text-[13px] text-[#C53030]">{ttsError}</p> : null}
                  {approveError ? <p className="text-[13px] text-[#C53030]">{approveError}</p> : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => void handlePlayAloud()}
                      disabled={isSynthesizingAudio || !draft.trim()}
                      className="ehr-btn-secondary"
                    >
                      {isSynthesizingAudio ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : isPlayingAudio ? (
                        <>
                          <Volume2 className="h-4 w-4 text-[#2B6CB0]" />
                          Stop audio
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-4 w-4 text-[#2B6CB0]" />
                          Play aloud
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleApproveClick()}
                      disabled={approving || !draft.trim()}
                      className="ehr-btn-primary px-5 py-2.5"
                    >
                      {approving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Starting agent...
                        </>
                      ) : activePatient.outreachApproved ? (
                        <>
                          <Check className="h-4 w-4" />
                          Approve and send
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Approve and send
                        </>
                      )}
                    </button>
                  </div>
                </section>

                {/* Right: Phone Preview */}
                <section className="lg:col-span-5 calm-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                      <Smartphone className="h-4 w-4 text-slate-500" />
                      Phone preview
                    </span>
                    <span
                      className={`text-[12.5px] font-semibold ${
                        activePatient.outreachApproved ? 'text-[#15803D]' : 'text-[#D97706]'
                      }`}
                    >
                      {activePatient.outreachApproved ? 'Approved' : 'Draft only'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-center justify-between text-[12px] text-slate-500 border-b border-slate-200 pb-2">
                      <span className="font-semibold text-slate-700">NYC Community Health</span>
                      <span className="font-mono tabular-nums">{chart.phone}</span>
                    </div>
                    <div className="rounded-xl bg-[#2B6CB0] px-4 py-3 text-[14px] leading-relaxed text-white whitespace-pre-wrap">
                      {draft || 'No message drafted yet.'}
                    </div>
                  </div>
                </section>
              </div>

              {/* Live Managed Agent Follow-up Card appears here once approved */}
              {matchingFollowUps.length > 0 ? (
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="calm-heading">Follow-up agent (Gemini Managed Agent)</h2>
                    {recheckError ? (
                      <span className="text-[13px] text-[#C53030]">{recheckError}</span>
                    ) : null}
                  </div>

                  {matchingFollowUps.slice(0, 2).map((fu) => {
                    const busy = fu.agentStatus === 'Queued' || fu.agentStatus === 'Running';
                    const detailsOpen = Boolean(expandedAgentStepIds[fu.id]);

                    return (
                      <div key={fu.id} className="calm-card p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Bot className="h-4 w-4 text-[#2B6CB0]" />
                              <h3 className="text-[16px] font-semibold text-slate-900">
                                {fu.referralName}
                              </h3>
                              <span
                                className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${
                                  fu.agentStatus === 'Done'
                                    ? 'text-[#15803D]'
                                    : busy
                                      ? 'text-[#2B6CB0]'
                                      : 'text-slate-600'
                                }`}
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                {fu.agentStatus || fu.status}
                              </span>
                            </div>
                            <p className="mt-1 text-[13.5px] text-slate-600">
                              {fu.status} · {fu.dueLabel}
                              {fu.lastCheckedAt ? ` · Checked ${fu.lastCheckedAt}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAgentStepIds((prev) => ({
                                  ...prev,
                                  [fu.id]: !prev[fu.id],
                                }))
                              }
                              className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                            >
                              {detailsOpen ? 'Hide' : 'Details'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleCheckAgain(fu)}
                              className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                              Check again
                            </button>
                          </div>
                        </div>

                        {fu.agentError ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
                            Fallback used: {fu.agentError}
                          </div>
                        ) : null}

                        {fu.checkInMessage ? (
                          <div className="soft-surface p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-slate-700">
                                Check-in draft ({fu.language})
                              </span>
                              {fu.checkInApproved ? (
                                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#15803D]">
                                  <Check className="h-4 w-4" />
                                  Approved
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateFollowUp(fu.id, { checkInApproved: true })
                                  }
                                  className="ehr-btn-primary py-1 px-3 text-[13px]"
                                >
                                  Approve
                                </button>
                              )}
                            </div>
                            <p className="text-[14px] text-slate-800">{fu.checkInMessage}</p>
                          </div>
                        ) : null}

                        {detailsOpen ? (
                          <div className="border-t border-slate-100 pt-3 space-y-3 text-[13.5px]">
                            {fu.evidenceQuote ? (
                              <div className="text-slate-700">
                                <span className="font-semibold text-slate-900">Evidence quote: </span>
                                &ldquo;{fu.evidenceQuote}&rdquo;
                              </div>
                            ) : null}
                            {fu.agentSteps && fu.agentSteps.length > 0 ? (
                              <ul className="space-y-1.5 text-[13px] text-slate-600">
                                {fu.agentSteps.map((s) => (
                                  <li key={s.id}>
                                    <span className="font-semibold text-slate-800">{s.label}</span>
                                    {s.detail ? ` - ${s.detail}` : ''}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              ) : null}

              {/* Encounter Timeline & Model Trace Behind Details Toggle */}
              <section className="calm-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setStep4DetailsOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-800">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Timeline and model trace
                  </span>
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0]">
                    {step4DetailsOpen ? 'Hide' : 'Details'}
                    {step4DetailsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {step4DetailsOpen ? (
                  <div className="border-t border-slate-200 p-4 space-y-4">
                    {activePatient.timeline.length > 0 ? (
                      <ul className="divide-y divide-slate-100 text-[13.5px]">
                        {activePatient.timeline.map((ev) => (
                          <li key={ev.id} className="py-2 flex items-baseline justify-between gap-4">
                            <div>
                              <span className="font-semibold text-slate-900">{ev.title}</span>
                              <span className="text-slate-600"> · {ev.detail}</span>
                            </div>
                            <span className="font-mono text-[12px] text-slate-400 shrink-0 tabular-nums">
                              {new Date(ev.timestampIso).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {activePatient.result.modelTrace && activePatient.result.modelTrace.length > 0 ? (
                      <ModelTracePanel
                        modelTrace={activePatient.result.modelTrace}
                        escalatedToCarbon={activePatient.result.escalatedToCarbon}
                        escalationReason={activePatient.result.escalationReason}
                        followUps={matchingFollowUps}
                        defaultOpen={true}
                      />
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {/* Snap a Form Camera Modal */}
      {cameraOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Snap a form"
        >
          <div className="calm-card w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <span className="text-[15px] font-semibold text-slate-900">Snap a form</span>
              <button
                type="button"
                onClick={closeSnapCamera}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close camera"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {cameraError ? (
                <p className="text-[14px] text-slate-600">{cameraError}</p>
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full max-h-80 rounded-lg bg-slate-900 object-cover"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => snapInputRef.current?.click()}
                  className="ehr-btn-secondary"
                >
                  Choose photo
                </button>
                {cameraStreamActive ? (
                  <button
                    type="button"
                    onClick={handleCaptureAndRun}
                    className="ehr-btn-primary"
                  >
                    Capture and run
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
