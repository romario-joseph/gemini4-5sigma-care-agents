import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Mic,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
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
  PipelineResult,
  ReferralItem,
  SingleCallResult,
  TimelineStep,
  WorkflowStage,
} from '../types.ts';
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

interface IntakeTabProps {
  demoMode: boolean;
  externalRunRequest: ExternalRunPayload | null;
  onCreateFollowUp: (item: FollowUpItem) => void;
  onNavigateFollowUps: () => void;
  onIntakeCompleted?: (result: PipelineResult, mode: InputMode) => void;
  onOpenPatientChart?: () => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  food: 'Food',
  housing: 'Housing',
  utilities: 'Utilities',
  clinic: 'Clinic',
  transport: 'Transport',
  benefits: 'Benefits',
  other: 'Other',
};

function isSafeHttpUrl(url: string): boolean {
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

function UrgencyBadge({ urgency }: { urgency: 1 | 2 | 3 }) {
  if (urgency === 3) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-medium text-red-700 border border-red-200/80 whitespace-nowrap">
        Urgent
      </span>
    );
  }
  if (urgency === 2) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-medium text-amber-800 border border-amber-200/80 whitespace-nowrap">
        This week
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] font-medium text-neutral-700 border border-neutral-200 whitespace-nowrap">
      Routine
    </span>
  );
}

const HOW_IT_WORKS_STEPS: Array<{
  id: 'read' | 'verify' | 'check';
  title: string;
  subtitle: string;
}> = [
  { id: 'read', title: 'Read', subtitle: 'Gemini 4 Hydrogen' },
  { id: 'verify', title: 'Verify', subtitle: 'Gemini 4 Neon + Search' },
  { id: 'check', title: 'Check', subtitle: 'Self-check' },
];

export const IntakeTab: React.FC<IntakeTabProps> = ({
  demoMode,
  externalRunRequest,
  onCreateFollowUp,
  onNavigateFollowUps,
  onIntakeCompleted,
  onOpenPatientChart,
}) => {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState<string>(DEMO_C01_TEXT);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('');
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [isPreparingSample, setIsPreparingSample] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const [expandedReferralIds, setExpandedReferralIds] = useState<Record<string, boolean>>({});
  const [rejectedOpen, setRejectedOpen] = useState(false);

  const [outreachText, setOutreachText] = useState('');
  const [approvedSent, setApprovedSent] = useState(false);

  const [isSynthesizingAudio, setIsSynthesizingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<SingleCallResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const snapInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const demoTimersRef = useRef<number[]>([]);
  const elapsedTimerRef = useRef<number | null>(null);

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
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (!externalRunRequest) return;
    setErrorMsg(null);
    if (externalRunRequest.clearResult) {
      setResult(null);
      setTimeline([]);
      setCompareResult(null);
      setCompareError(null);
      setApprovedSent(false);
    }

    if (externalRunRequest.mode === 'photo') {
      setInputMode('photo');
      if (externalRunRequest.fileData) {
        setPhotoDataUrl(externalRunRequest.fileData);
        setPhotoMimeType(externalRunRequest.mimeType || 'image/jpeg');
        setPhotoName(externalRunRequest.fileName || 'Test form photo');
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
        const nextText = externalRunRequest.text;
        setTextInput(nextText);
        if (externalRunRequest.autoRun) {
          void executePipeline({
            mode: 'text',
            text: nextText,
            forceLive: true,
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRunRequest]);

  const handlePhotoFile = (file: File | undefined, autoRunAfterLoad: boolean = false) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (JPG, PNG, or WebP).');
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
            forceLive: true,
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
      setCameraError('Live camera preview is not available in this browser. Use the button below to snap or upload a form.');
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
      setCameraError('Camera permission denied or unavailable. Use "Choose or snap photo" below instead.');
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
      forceLive: true,
    });
  };

  const upsertTimelineStep = (step: TimelineStep) => {
    setTimeline((prev) => {
      const idx = prev.findIndex((s) => s.id === step.id);
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = step;
      return next;
    });

    if (step.id === 'read' && step.status === 'active') setWorkflowStage('read');
    if (step.id === 'verify' && step.status === 'active') setWorkflowStage('verify');
    if (step.id === 'selfcheck' && step.status === 'active') setWorkflowStage('check');
  };

  const runDemoPlayback = () => {
    clearDemoTimers();
    startElapsedTimer();
    setIsRunning(true);
    setWorkflowStage('read');
    setErrorMsg(null);
    setResult(null);
    setCompareResult(null);
    setCompareError(null);
    setApprovedSent(false);
    setRejectedOpen(false);
    setExpandedReferralIds({});
    setTimeline([{ id: 'read', label: 'Reading handwriting...', status: 'active' }]);

    const t1 = window.setTimeout(() => {
      upsertTimelineStep({ id: 'read', label: 'Reading handwriting...', status: 'done' });
      upsertTimelineStep({ id: 'needs', label: 'Found 3 needs', status: 'done' });
      upsertTimelineStep({
        id: 'verify',
        label: 'Checking food, utilities, clinic services near 10459...',
        status: 'active',
      });
      setResult({
        intake: DEMO_C01_RESULT.intake,
        verifiedReferrals: DEMO_C01_RESULT.verifiedReferrals.map((r) => ({
          ...r,
          verified: false,
          checking_live: true,
        })),
        rejectedReferrals: [],
        outreachDraft: '',
        durationSeconds: 0,
      });
    }, 550);

    const t2 = window.setTimeout(() => {
      upsertTimelineStep({
        id: 'verify',
        label: 'Checking food, utilities, clinic services near 10459...',
        status: 'done',
      });
      upsertTimelineStep({ id: 'selfcheck', label: 'Rejected 1 referral', status: 'warning' });
      setWorkflowStage('check');
      upsertTimelineStep({
        id: 'outreach',
        label: 'Drafting message in Spanish...',
        status: 'active',
      });
    }, 1350);

    const t3 = window.setTimeout(() => {
      upsertTimelineStep({
        id: 'outreach',
        label: 'Drafting message in Spanish...',
        status: 'done',
      });
      setResult(DEMO_C01_RESULT);
      setOutreachText(DEMO_C01_RESULT.outreachDraft);
      setWorkflowStage('done');
      stopElapsedTimer();
      setIsRunning(false);
      onIntakeCompleted?.(DEMO_C01_RESULT, inputMode);
    }, 2100);

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
      if (activeMode === 'text' && !activeText.trim()) {
        setTextInput(DEMO_C01_TEXT);
      }
      runDemoPlayback();
      return;
    }

    if (activeMode === 'text' && !activeText.trim()) {
      setErrorMsg('Please paste or type patient intake notes before running.');
      return;
    }
    if (activeMode === 'photo' && !activeFileData) {
      setErrorMsg('Please upload a handwritten intake photo first.');
      return;
    }
    if (activeMode === 'voice' && !activeFileData) {
      setErrorMsg('Please record or upload a voice note first.');
      return;
    }

    clearDemoTimers();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    startElapsedTimer();
    setIsRunning(true);
    setWorkflowStage('read');
    setErrorMsg(null);
    setResult(null);
    setCompareResult(null);
    setCompareError(null);
    setApprovedSent(false);
    setRejectedOpen(false);
    setExpandedReferralIds({});
    setTimeline([]);

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
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }
          if (!dataLine) continue;

          const parsed = JSON.parse(dataLine);
          if (eventName === 'status') {
            upsertTimelineStep(parsed as TimelineStep);
          } else if (eventName === 'intake') {
            const intakeData = parsed as IntakeExtraction;
            setResult((prev) => ({
              intake: intakeData,
              verifiedReferrals: prev?.verifiedReferrals || [],
              rejectedReferrals: prev?.rejectedReferrals || [],
              outreachDraft: prev?.outreachDraft || '',
              durationSeconds: prev?.durationSeconds || 0,
            }));
          } else if (eventName === 'referrals_initial') {
            const initPayload = parsed as {
              verifiedReferrals: ReferralItem[];
              rejectedReferrals: ReferralItem[];
            };
            setResult((prev) =>
              prev
                ? {
                    ...prev,
                    verifiedReferrals: initPayload.verifiedReferrals,
                    rejectedReferrals: initPayload.rejectedReferrals || [],
                  }
                : null
            );
          } else if (eventName === 'need_verified') {
            const needPayload = parsed as {
              needId: string;
              verifiedReferrals: ReferralItem[];
              rejectedReferrals: ReferralItem[];
            };
            setResult((prev) => {
              if (!prev) return null;
              const keptOthers = prev.verifiedReferrals.filter(
                (r) => r.need_id !== needPayload.needId
              );
              const existingRejIds = new Set(prev.rejectedReferrals.map((r) => r.id));
              const mergedRejected = [
                ...prev.rejectedReferrals,
                ...needPayload.rejectedReferrals.filter((r) => !existingRejIds.has(r.id)),
              ];
              return {
                ...prev,
                verifiedReferrals: [...keptOthers, ...needPayload.verifiedReferrals],
                rejectedReferrals: mergedRejected,
              };
            });
          } else if (eventName === 'referrals') {
            const refPayload = parsed as {
              verifiedReferrals: ReferralItem[];
              rejectedReferrals: ReferralItem[];
            };
            setResult((prev) =>
              prev
                ? {
                    ...prev,
                    verifiedReferrals: refPayload.verifiedReferrals,
                    rejectedReferrals: refPayload.rejectedReferrals,
                  }
                : null
            );
          } else if (eventName === 'done') {
            const donePayload = parsed as PipelineResult;
            setResult(donePayload);
            setOutreachText(donePayload.outreachDraft);
            setWorkflowStage('done');
            onIntakeCompleted?.(donePayload, activeMode);
          } else if (eventName === 'error') {
            throw new Error((parsed as { message?: string }).message || 'Pipeline failed.');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setWorkflowStage('error');
        setErrorMsg(err instanceof Error ? err.message : 'Unable to process intake.');
      }
    } finally {
      stopElapsedTimer();
      setIsRunning(false);
    }
  };

  const handleSampleMessyNote = () => {
    setInputMode('text');
    setTextInput(DEMO_C01_TEXT);
    void executePipeline({ mode: 'text', text: DEMO_C01_TEXT });
  };

  const handleSampleDoseCase = () => {
    const c09 = TEST_CASES.find((t) => t.id === 'C09')?.text || 'dx diabetes, asks what dose of metformin to take, also needs food';
    setInputMode('text');
    setTextInput(c09);
    void executePipeline({ mode: 'text', text: c09, forceLive: true });
  };

  const handleSampleSpanishVoice = async () => {
    setIsPreparingSample(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: DEMO_SPANISH_VOICE_SCRIPT,
          language: 'Spanish',
        }),
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
      // Fallback to text mode if audio synthesis is unavailable
    }
    setIsPreparingSample(false);
    setInputMode('text');
    setTextInput(DEMO_SPANISH_VOICE_SCRIPT);
    void executePipeline({ mode: 'text', text: DEMO_SPANISH_VOICE_SCRIPT, forceLive: true });
  };

  const handlePlayAloud = async () => {
    if (isPlayingAudio && ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      setIsPlayingAudio(false);
      return;
    }

    if (!outreachText.trim()) return;
    setIsSynthesizingAudio(true);
    setTtsError(null);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: outreachText,
          language: result?.intake.language || 'English',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Could not synthesize audio.');
      }

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      ttsAudioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        setTtsError('Audio playback failed in this browser.');
      };
      await audio.play();
      setIsPlayingAudio(true);
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Text-to-speech failed.');
    } finally {
      setIsSynthesizingAudio(false);
    }
  };

  const handleApproveAndSend = async () => {
    if (!result || result.verifiedReferrals.length === 0) return;
    const top = result.verifiedReferrals[0];
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const formattedDate = dueDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const language =
      result.intake.language && result.intake.language !== 'unknown'
        ? result.intake.language
        : 'English';
    const patientFirstName = result.intake.patient_first_name || 'Patient';
    const referralsPayload = result.verifiedReferrals.slice(0, 4).map((r) => ({
      name: r.name,
      address: r.address,
      hours: r.hours,
      source_url: r.source_url,
    }));

    let agentJobId: string | undefined;
    try {
      const res = await fetch('/api/followup/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientFirstName,
          language,
          constraints: result.intake.constraints,
          referrals: referralsPayload,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { jobId?: string };
        agentJobId = data.jobId;
      }
    } catch {
      // Follow-up still created even if background queue request hiccups
    }

    onCreateFollowUp({
      id: `fu-${Date.now()}`,
      patientFirstName,
      referralName: top.name,
      referralAddress: top.address,
      referralHours: top.hours,
      referralUrl: top.source_url,
      referrals: referralsPayload,
      constraints: result.intake.constraints,
      language,
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
    setApprovedSent(true);
  };

  const handleCompareSingleCall = async () => {
    if (demoMode && result?.intake.zip === '10459') {
      setCompareResult(DEMO_C01_SINGLE_CALL);
      return;
    }

    setIsComparing(true);
    setCompareError(null);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: inputMode,
          text: inputMode === 'text' ? textInput : undefined,
          fileData:
            inputMode === 'photo'
              ? photoDataUrl
              : inputMode === 'voice'
                ? audioDataUrl
                : undefined,
          mimeType:
            inputMode === 'photo'
              ? photoMimeType
              : inputMode === 'voice'
                ? audioMimeType
                : undefined,
          constraints: result?.intake.constraints || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Single-call comparison failed.');
      }
      setCompareResult(data as SingleCallResult);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  const toggleReferralExpand = (id: string) => {
    setExpandedReferralIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStepVisualState = (stepId: 'read' | 'verify' | 'check') => {
    const order = { idle: 0, read: 1, verify: 2, check: 3, done: 4, error: 0 };
    const current = order[workflowStage];
    const target = stepId === 'read' ? 1 : stepId === 'verify' ? 2 : 3;
    if (workflowStage === 'done' || current > target) return 'done';
    if (current === target && isRunning) return 'active';
    return 'idle';
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      {/* Hero */}
      <section className="max-w-3xl">
        <h1
          className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-[52px] sm:leading-[1.08]"
          style={{ textWrap: 'balance' }}
        >
          Intake to referral in one minute.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-neutral-500 sm:text-[19px]">
          Upload a handwritten form or a voice note. Get verified NYC services with a source for every one.
        </p>
      </section>

      {/* How it works strip */}
      <section aria-label="How Care Agents works" className="mt-7">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const state = getStepVisualState(step.id);
            return (
              <div
                key={step.id}
                className={`flex items-center justify-between rounded-[14px] border px-4 py-3 transition-all duration-200 ${
                  state === 'active'
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.05]'
                    : state === 'done'
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-black/[0.06] bg-[#F5F5F7]/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                      state === 'active'
                        ? 'bg-[#0071E3] text-white'
                        : state === 'done'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-neutral-600 border border-black/[0.08]'
                    }`}
                  >
                    {state === 'done' ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : index + 1}
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-neutral-900 leading-tight">
                      {step.title}
                    </div>
                    <div className="text-[12px] text-neutral-500">{step.subtitle}</div>
                  </div>
                </div>
                {state === 'active' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#0071E3]" />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Input Card */}
      <section className="mt-5">
        <div className="card-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-[#F5F5F7] p-1 border border-black/[0.04]">
              <button
                type="button"
                onClick={() => setInputMode('photo')}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition whitespace-nowrap ${
                  inputMode === 'photo'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                Photo
              </button>
              <button
                type="button"
                onClick={() => setInputMode('voice')}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition whitespace-nowrap ${
                  inputMode === 'voice'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Mic className="h-3.5 w-3.5" />
                Voice
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition whitespace-nowrap ${
                  inputMode === 'text'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Text
              </button>
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
                className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-neutral-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Camera className="h-4 w-4" />
                Snap a form
              </button>
              {inputMode === 'text' && textInput ? (
                <button
                  type="button"
                  onClick={() => setTextInput('')}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition whitespace-nowrap"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
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
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed px-6 py-12 text-center transition ${
                      isDragging
                        ? 'border-[#0071E3] bg-[#0071E3]/5'
                        : 'border-neutral-300 bg-[#F5F5F7]/70 hover:border-neutral-400'
                    }`}
                  >
                    <Upload className="h-7 w-7 text-neutral-400" />
                    <p className="mt-3 text-[15px] font-medium text-neutral-800">
                      Drop a photo of a handwritten intake form
                    </p>
                    <p className="mt-1 text-[13px] text-neutral-500">
                      Supports JPG, PNG, or WebP from phone camera or scanner
                    </p>
                    <span className="mt-4 inline-flex items-center rounded-full border border-black/[0.1] bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800">
                      Choose photo
                    </span>
                  </div>
                ) : (
                  <div className="rounded-[14px] bg-[#F5F5F7] p-4">
                    <div className="flex items-center justify-between gap-3 pb-3">
                      <span className="truncate text-[13px] font-medium text-neutral-700">
                        {photoName || 'Uploaded intake photo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl(null);
                          setPhotoMimeType(null);
                          setPhotoName('');
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-neutral-700 border border-black/[0.08] hover:bg-neutral-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                    <img
                      src={photoDataUrl}
                      alt="Uploaded handwritten intake form preview"
                      referrerPolicy="no-referrer"
                      className="max-h-80 w-full rounded-xl object-contain bg-white border border-black/[0.06]"
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
                rows={4}
                placeholder="Paste or type a messy intake note (e.g., pt Maria R, prefers espanol. lives 10459. kids no food since thurs...)"
                className="w-full resize-y rounded-[14px] border border-black/[0.08] bg-[#F5F5F7]/65 p-4 text-[15px] leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:border-[#0071E3] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 transition"
              />
            ) : null}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-[13px] text-neutral-500">
              {demoMode
                ? 'Demo mode is on: Run plays the saved C01 verification instantly.'
                : 'Runs Gemini 4 Hydrogen intake extraction, Gemini 4 Neon Search verification, and self-check.'}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isRunning ? (
                <span className="font-mono text-[14px] font-medium text-neutral-600 tabular-nums">
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void executePipeline()}
                disabled={isRunning || isPreparingSample}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0071E3] px-8 py-3 text-[15px] font-semibold text-white shadow-xs transition hover:bg-[#0062C4] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  'Run'
                )}
              </button>
            </div>
          </div>

          {errorMsg ? (
            <div className="mt-5 rounded-[14px] border border-red-200 bg-red-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-red-900">
                  Could not complete intake run
                </p>
                <p className="mt-0.5 text-[13.5px] text-red-700">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => void executePipeline()}
                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-red-200 px-4 py-2 text-[13px] font-medium text-red-800 hover:bg-red-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : null}
        </div>

        <p className="mt-3 px-1 text-[13px] text-neutral-500">
          Synthetic data only. A person approves before anything is sent.
        </p>

        {/* Try it yourself */}
        <div className="mt-4 soft-surface px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-neutral-800">Try it yourself</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isRunning || isPreparingSample}
              onClick={handleSampleMessyNote}
              className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
            >
              Messy note
            </button>
            <button
              type="button"
              disabled={isRunning || isPreparingSample}
              onClick={() => void handleSampleSpanishVoice()}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
            >
              {isPreparingSample ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating Spanish voice...
                </>
              ) : (
                'Spanish voice'
              )}
            </button>
            <button
              type="button"
              disabled={isRunning || isPreparingSample}
              onClick={handleSampleDoseCase}
              className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
            >
              Tricky case (asks for a dose)
            </button>
          </div>
        </div>
      </section>

      {/* Live Status Timeline */}
      <AnimatePresence>
        {timeline.length > 0 ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <div className="soft-surface px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-black/[0.05] text-[12.5px] font-medium text-neutral-500">
                <span>Live progress</span>
                <span className="font-mono tabular-nums">
                  {isRunning
                    ? `${(elapsedMs / 1000).toFixed(1)}s elapsed`
                    : result?.durationSeconds
                      ? `Done in ${Math.round(result.durationSeconds)} s`
                      : ''}
                </span>
              </div>
              <div className="space-y-2.5">
                {timeline.map((step) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 text-[14px]"
                  >
                    {step.status === 'active' ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#0071E3]" />
                    ) : step.status === 'warning' ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                    <span
                      className={
                        step.status === 'active'
                          ? 'font-medium text-neutral-900'
                          : step.status === 'warning'
                            ? 'font-medium text-amber-800'
                            : 'text-neutral-700'
                      }
                    >
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* Results */}
      {result ? (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-10 space-y-10"
        >
          {/* Top Summary Counts Bar */}
          <div className="card-surface px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-[12px] text-neutral-500">Needs found</div>
                <div className="text-[20px] font-semibold text-neutral-900 tabular-nums">
                  {result.intake.needs.length}
                </div>
              </div>
              <div className="h-8 w-px bg-black/[0.08]" aria-hidden="true" />
              <div>
                <div className="text-[12px] text-neutral-500">Verified</div>
                <div className="text-[20px] font-semibold text-emerald-700 tabular-nums">
                  {
                    result.verifiedReferrals.filter(
                      (r) =>
                        !r.checking_live &&
                        (r.verification_outcome === 'verified' ||
                          (r.verified &&
                            !r.not_verified_live &&
                            r.verification_outcome !== 'call_to_confirm'))
                    ).length
                  }
                </div>
              </div>
              <div className="h-8 w-px bg-black/[0.08]" aria-hidden="true" />
              <div>
                <div className="text-[12px] text-neutral-500">Call to confirm</div>
                <div className="text-[20px] font-semibold text-amber-700 tabular-nums">
                  {
                    result.verifiedReferrals.filter(
                      (r) =>
                        !r.checking_live &&
                        (r.verification_outcome === 'call_to_confirm' || r.not_verified_live)
                    ).length
                  }
                </div>
              </div>
              <div className="h-8 w-px bg-black/[0.08]" aria-hidden="true" />
              <div>
                <div className="text-[12px] text-neutral-500">Rejected</div>
                <div className="text-[20px] font-semibold text-neutral-900 tabular-nums">
                  {result.rejectedReferrals.length}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {result.durationSeconds > 0 ? (
                <div className="text-[13px] font-medium text-neutral-600 tabular-nums">
                  Done in {Math.round(result.durationSeconds)} s
                </div>
              ) : null}
              {onOpenPatientChart ? (
                <button
                  type="button"
                  onClick={onOpenPatientChart}
                  className="rounded-lg border border-[#0071E3]/30 bg-[#0071E3]/[0.06] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#0071E3] hover:bg-[#0071E3]/10 whitespace-nowrap"
                >
                  Open patient chart
                </button>
              ) : null}
            </div>
          </div>

          {/* Safety & Guardrail Banners */}
          {result.intake.prompt_injection_detected ? (
            <div className="rounded-[18px] border border-red-200 bg-red-50/70 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div>
                  <h2 className="text-[15px] font-semibold text-red-900">
                    Instruction override blocked
                  </h2>
                  <p className="mt-1 text-[14px] text-red-800">
                    {result.intake.prompt_injection_reason ||
                      'This input attempted to override system rules or access restricted records. No needs or referrals were generated.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {result.intake.multiple_patients ? (
            <div className="rounded-[18px] border border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <h2 className="text-[15px] font-semibold text-amber-900">
                    Multiple patients detected
                  </h2>
                  <p className="mt-1 text-[14px] text-amber-800">
                    This intake appears to cover more than one patient. Please review and separate patient records before sending referrals.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {result.intake.medical_advice_requested ? (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50/70 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <h2 className="text-[15px] font-semibold text-amber-900">
                    Clinical question routed safely
                  </h2>
                  <p className="mt-1 text-[14px] text-amber-800">
                    The note asks for medication dosage or medical advice. Care Agents never suggests doses or clinical advice: connect the patient with a licensed clinic below.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Extracted Needs + Unclear */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[20px] font-semibold tracking-tight text-neutral-900">
                Extracted intake
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
                {result.intake.patient_first_name ? (
                  <>
                    <span>Patient: {result.intake.patient_first_name}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                <span>Language: {result.intake.language && result.intake.language !== 'unknown' ? result.intake.language : 'English'}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  ZIP: {result.intake.zip || (result.intake.borough ? `${result.intake.borough} (no ZIP)` : 'Not stated')}
                </span>
              </div>
            </div>

            {!result.intake.zip && result.intake.needs.length > 0 && !result.intake.prompt_injection_detected ? (
              <div className="mt-3 rounded-[14px] border border-amber-200/80 bg-amber-50/75 px-4 py-3 text-[13.5px] text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">Ask the patient for their ZIP:</span>{' '}
                  {result.intake.borough
                    ? `No ZIP code was given. Showing ${result.intake.borough} and citywide NYC options until a neighborhood ZIP is confirmed.`
                    : 'No ZIP code was given. Showing citywide NYC options until a neighborhood ZIP is confirmed.'}
                </div>
              </div>
            ) : null}

            {result.intake.constraints.length > 0 ? (
              <p className="mt-2 text-[14px] text-neutral-600">
                <span className="font-medium text-neutral-800">Constraints:</span>{' '}
                {result.intake.constraints.join(' · ')}
              </p>
            ) : null}

            {result.intake.needs.length > 0 ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.intake.needs.map((need) => (
                  <div key={need.id} className="card-surface p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-neutral-900">
                          {DOMAIN_LABELS[need.domain] || need.domain}
                        </span>
                        <UrgencyBadge urgency={need.urgency} />
                      </div>
                      <p className="mt-2.5 text-[15px] font-medium leading-snug text-neutral-900">
                        {need.summary}
                      </p>
                    </div>
                    {need.evidence_quote ? (
                      <p className="mt-3 border-t border-black/[0.06] pt-3 text-[13px] italic text-neutral-500">
                        “{need.evidence_quote}”
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {result.intake.unclear.length > 0 ? (
              <div className="mt-4 soft-surface p-5">
                <h3 className="text-[14px] font-semibold text-neutral-900">
                  Unclear or crossed-out items
                </h3>
                <ul className="mt-2 space-y-1 text-[14px] text-neutral-600">
                  {result.intake.unclear.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Verified Referrals */}
          {result.verifiedReferrals.length > 0 || result.rejectedReferrals.length > 0 ? (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[20px] font-semibold tracking-tight text-neutral-900">
                    NYC referrals
                  </h2>
                  <p className="mt-1 text-[14px] text-neutral-500">
                    Click any referral card to see why it matches this patient’s constraints.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCompareSingleCall()}
                  disabled={isComparing}
                  className="inline-flex items-center gap-2 rounded-full border border-black/[0.12] bg-white px-4 py-2 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {isComparing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    'Compare with single call'
                  )}
                </button>
              </div>

              {compareError ? (
                <p className="mt-3 text-[13px] text-red-600">{compareError}</p>
              ) : null}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {result.verifiedReferrals.map((ref) => {
                  const isOpen = Boolean(expandedReferralIds[ref.id]);
                  const safeUrl = isSafeHttpUrl(ref.source_url);
                  const hasMapsAddress = isPhysicalAddress(ref.address);
                  const isCheckingLive = Boolean(ref.checking_live);
                  const isCallToConfirm =
                    !isCheckingLive &&
                    (ref.verification_outcome === 'call_to_confirm' ||
                      Boolean(ref.not_verified_live) ||
                      (!ref.verified && ref.verification_outcome !== 'verified'));
                  const checks = ref.checks || {
                    hours: Boolean(ref.verified),
                    address: Boolean(ref.verified),
                    eligibility: Boolean(ref.verified),
                    open_on_available_days: Boolean(ref.verified),
                  };

                  return (
                    <article
                      key={ref.id}
                      className="card-surface overflow-hidden transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] flex flex-col justify-between"
                    >
                      <button
                        type="button"
                        onClick={() => toggleReferralExpand(ref.id)}
                        className="w-full p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0071E3]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
                              <span>{DOMAIN_LABELS[ref.domain] || ref.domain}</span>
                              {ref.subtype ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-neutral-700 font-medium">{ref.subtype}</span>
                                </>
                              ) : null}
                              {ref.from_cache ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Cached</span>
                                </>
                              ) : null}
                              {ref.citywide_no_zip ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-neutral-700 font-medium">Citywide, no ZIP given</span>
                                </>
                              ) : null}
                              {ref.hours_corrected ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-[#0071E3] font-medium">Hours corrected from source</span>
                                </>
                              ) : null}
                            </div>
                            <h3 className="mt-1 text-[16px] font-semibold text-neutral-900">
                              {ref.name}
                            </h3>
                            {ref.official_listing && ref.dataset_name ? (
                              <p className="mt-0.5 text-[11.5px] font-semibold text-[#1F3A5F]">
                                Official NYC listing ({ref.dataset_name}, updated {ref.dataset_updated || 'N/A'})
                              </p>
                            ) : null}
                          </div>

                          {isCheckingLive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-2.5 py-1 text-[12px] font-medium text-[#0071E3] border border-[#0071E3]/25 whitespace-nowrap shrink-0">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Checking live...
                            </span>
                          ) : isCallToConfirm ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-800 border border-amber-200/80 whitespace-nowrap shrink-0">
                              <AlertTriangle className="h-3 w-3" />
                              Call to confirm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700 border border-emerald-200/80 whitespace-nowrap shrink-0">
                              <Check className="h-3 w-3 stroke-[2.5]" />
                              Verified today
                            </span>
                          )}
                        </div>

                        <dl className="mt-4 space-y-1.5 text-[13.5px] text-neutral-700">
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">Address</dt>
                            <dd className="font-medium text-neutral-900">{ref.address}</dd>
                          </div>
                          {ref.phone && ref.phone !== 'Not listed' ? (
                            <div className="flex gap-2">
                              <dt className="w-20 shrink-0 text-neutral-500">Phone</dt>
                              <dd className="tabular-nums font-medium text-neutral-900">{ref.phone}</dd>
                            </div>
                          ) : null}
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">Hours</dt>
                            <dd>{ref.hours}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">Eligibility</dt>
                            <dd className="text-neutral-600">{ref.eligibility}</dd>
                          </div>
                        </dl>

                        {/* What we checked */}
                        <div className="mt-4 rounded-xl bg-[#F5F5F7]/75 px-3.5 py-2.5 border border-black/[0.04]">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11.5px] font-semibold text-neutral-600">
                              What we checked
                            </span>
                            {ref.hours_corrected ? (
                              <span className="text-[11px] font-semibold text-[#0071E3]">
                                Hours corrected from source
                              </span>
                            ) : null}
                          </div>
                          {isCheckingLive ? (
                            <p className="text-[12.5px] text-[#0071E3]">
                              Fetching official source page to verify current hours and address...
                            </p>
                          ) : (
                            <>
                              {isCallToConfirm ? (
                                <p className="mb-2 text-[12.5px] font-medium text-amber-800">
                                  {ref.is_urgent_fallback
                                    ? 'No confirmed option found. Call 311 before sending.'
                                    : 'Could not confirm online. Call before sending.'}
                                </p>
                              ) : null}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                                {[
                                  { label: 'Hours', ok: checks.hours },
                                  { label: 'Address', ok: checks.address },
                                  { label: 'Eligibility', ok: checks.eligibility },
                                  { label: 'Open on available days', ok: checks.open_on_available_days },
                                ].map((chk) => (
                                  <div key={chk.label} className="flex items-center gap-1.5 text-neutral-700">
                                    {chk.ok ? (
                                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 stroke-[2.5]" />
                                    ) : (
                                      <X className="h-3.5 w-3.5 shrink-0 text-amber-600 stroke-[2.5]" />
                                    )}
                                    <span className="truncate">{chk.label}</span>
                                  </div>
                                ))}
                              </div>
                              {ref.evidence_quote ? (
                                <p className="mt-2 border-t border-black/[0.05] pt-2 text-[12px] italic text-neutral-600 leading-snug">
                                  Source quote: &ldquo;{ref.evidence_quote}&rdquo;
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                      </button>

                      {/* Action bar outside button to keep valid HTML */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-3 bg-white">
                        <div className="flex flex-wrap items-center gap-3.5">
                          {safeUrl ? (
                            <a
                              href={ref.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0071E3] hover:underline"
                            >
                              Source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-[12px] text-neutral-400">Source unavailable</span>
                          )}

                          {ref.dataset_url &&
                          ref.dataset_url !== ref.source_url &&
                          isSafeHttpUrl(ref.dataset_url) ? (
                            <a
                              href={ref.dataset_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#1F3A5F] hover:underline"
                            >
                              NYC Open Data
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}

                          {hasMapsAddress ? (
                            <a
                              href={buildGoogleMapsUrl(ref.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-700 hover:text-[#0071E3] hover:underline"
                            >
                              <MapPin className="h-3 w-3" />
                              Open in Google Maps
                            </a>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleReferralExpand(ref.id)}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 hover:text-neutral-800"
                        >
                          {isOpen ? 'Hide match details' : 'Why this matches'}
                          {isOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-black/[0.06] bg-[#F5F5F7]/70 px-5 py-4 text-[13.5px] text-neutral-700"
                          >
                            <p className="font-medium text-neutral-900">Why it fits this patient</p>
                            <p className="mt-1 leading-relaxed">
                              {ref.why_matches || 'Matched based on borough, domain, and verified availability.'}
                            </p>
                            {ref.verification_note ? (
                              <p className="mt-2 text-[12.5px] text-neutral-500">
                                Self-check: {ref.verification_note}
                              </p>
                            ) : null}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </article>
                  );
                })}
              </div>

              {/* Collapsed Rejected by self-check */}
              {result.rejectedReferrals.length > 0 ? (
                <div className="mt-5 rounded-[18px] border border-black/[0.08] bg-[#F5F5F7]/65">
                  <button
                    type="button"
                    onClick={() => setRejectedOpen(!rejectedOpen)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left text-[14px] font-medium text-neutral-800 hover:text-neutral-900"
                  >
                    <span>
                      Rejected by self-check ({result.rejectedReferrals.length})
                    </span>
                    {rejectedOpen ? (
                      <ChevronUp className="h-4 w-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-500" />
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {rejectedOpen ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-black/[0.06] px-5 py-4 space-y-3"
                      >
                        {result.rejectedReferrals.map((rej) => (
                          <div
                            key={rej.id}
                            className="rounded-xl bg-white p-4 border border-black/[0.06] text-[13.5px]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-semibold text-neutral-900">{rej.name}</span>
                                {rej.official_listing && rej.dataset_name ? (
                                  <div className="text-[11px] font-semibold text-[#1F3A5F]">
                                    Official NYC listing ({rej.dataset_name}, updated {rej.dataset_updated || 'N/A'})
                                  </div>
                                ) : null}
                              </div>
                              <span className="text-[12px] text-red-700 font-medium">
                                Filtered out
                              </span>
                            </div>
                            <p className="mt-1 text-neutral-600">
                              {rej.address} · {rej.hours}
                            </p>
                            <p className="mt-2 text-red-700">
                              Reason: {rej.rejection_reason || 'Could not confirm hours or constraint fit.'}
                            </p>
                          </div>
                        ))}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Side-by-Side Single Call Comparison */}
          {compareResult ? (
            <section className="soft-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[18px] font-semibold text-neutral-900">
                  Side-by-side: Single call vs. Care Agents
                </h2>
                <span className="text-[13px] text-neutral-500 tabular-nums">
                  Single call completed in {compareResult.durationSeconds}s
                </span>
              </div>
              <p className="mt-1 text-[13.5px] text-neutral-600">
                Single call uses one ungrounded Gemini 4 Hydrogen prompt with no Search verification or self-check. Issues are highlighted below.
              </p>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-[14px] font-semibold text-neutral-700">
                    Single call (no verification): {compareResult.referrals.length} returned
                  </h3>
                  {compareResult.referrals.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 bg-white ${
                        item.rejected
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-black/[0.08]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold text-neutral-900">
                          {item.name}
                        </span>
                        {item.rejected ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-800 whitespace-nowrap">
                            Flagged by check
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700 whitespace-nowrap">
                            Passed
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] text-neutral-600">
                        {item.address || 'No address'} · {item.hours || 'No hours'}
                      </p>
                      {item.source_url ? (
                        <p className="mt-1 truncate text-[12px] text-[#0071E3]">
                          {item.source_url}
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] font-medium text-red-700">
                          Missing source URL
                        </p>
                      )}
                      {item.issues.length > 0 ? (
                        <ul className="mt-2.5 space-y-1 border-t border-red-200/70 pt-2 text-[12.5px] text-red-700">
                          {item.issues.map((iss, k) => (
                            <li key={k}>• {iss}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="text-[14px] font-semibold text-neutral-900">
                    Care Agents (verified): {result.verifiedReferrals.length} listed
                  </h3>
                  {result.verifiedReferrals.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-emerald-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold text-neutral-900">
                          {item.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                            item.verification_outcome === 'call_to_confirm' || item.not_verified_live
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {item.verification_outcome === 'call_to_confirm' || item.not_verified_live ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          {item.verification_outcome === 'call_to_confirm' || item.not_verified_live
                            ? 'Call to confirm'
                            : 'Verified today'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-neutral-600">
                        {item.address} · {item.hours}
                      </p>
                      {isSafeHttpUrl(item.source_url) ? (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#0071E3] hover:underline"
                        >
                          Source verified
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* Outreach */}
          {result.verifiedReferrals.length > 0 ? (
            <section>
              <div className="card-surface p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[19px] font-semibold tracking-tight text-neutral-900">
                      Patient outreach ({result.intake.language && result.intake.language !== 'unknown' ? result.intake.language : 'English'})
                    </h2>
                    <p className="mt-0.5 text-[13.5px] text-neutral-500">
                      Review and edit before approving. Includes top referral address and hours.
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[13px] tabular-nums ${
                      outreachText.length > 300 ? 'font-semibold text-red-600' : 'text-neutral-500'
                    }`}
                  >
                    {outreachText.length} / 300 chars
                  </span>
                </div>

                <textarea
                  value={outreachText}
                  onChange={(e) => {
                    setOutreachText(e.target.value);
                    setApprovedSent(false);
                  }}
                  rows={3}
                  className="mt-4 w-full rounded-[14px] border border-black/[0.08] bg-[#F5F5F7]/65 p-4 text-[15px] leading-relaxed text-neutral-900 focus:border-[#0071E3] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />

                {ttsError ? (
                  <p className="mt-2 text-[13px] text-red-600">{ttsError}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePlayAloud()}
                    disabled={isSynthesizingAudio || !outreachText.trim()}
                    className="inline-flex items-center gap-2 rounded-full border border-black/[0.12] bg-white px-5 py-2.5 text-[14px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isSynthesizingAudio ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating audio...
                      </>
                    ) : isPlayingAudio ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current text-[#0071E3]" />
                        Stop audio
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4 text-[#0071E3]" />
                        Play aloud
                      </>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-3">
                    {approvedSent ? (
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-emerald-700">
                          <Check className="h-4 w-4" />
                          Approved: follow-up scheduled in 3 days
                        </span>
                        <button
                          type="button"
                          onClick={onNavigateFollowUps}
                          className="rounded-full border border-black/[0.1] bg-white px-4 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50 whitespace-nowrap"
                        >
                          View Follow-ups
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleApproveAndSend()}
                        disabled={outreachText.length > 300 || !outreachText.trim()}
                        className="inline-flex items-center gap-2 rounded-full bg-[#0071E3] px-6 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#0062C4] disabled:opacity-50 whitespace-nowrap"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Approve and send
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </motion.div>
      ) : null}

      {/* Snap a form camera modal */}
      <AnimatePresence>
        {cameraOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-xl rounded-[22px] bg-white p-5 sm:p-6 shadow-2xl border border-black/[0.08]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-neutral-900">
                    Snap a handwritten intake form
                  </h2>
                  <p className="text-[13px] text-neutral-500">
                    Point your camera at the form and capture to verify immediately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSnapCamera}
                  className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Close camera"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl bg-neutral-950 aspect-[4/3] flex items-center justify-center relative">
                {cameraStreamActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="p-6 text-center text-[13.5px] text-neutral-300">
                    {cameraError || 'Starting camera...'}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => snapInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-black/[0.12] bg-white px-4 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Choose or snap photo
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={closeSnapCamera}
                    className="rounded-full border border-black/[0.1] bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureAndRun}
                    disabled={!cameraStreamActive}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0071E3] px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0062C4] disabled:opacity-50 whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4" />
                    Capture &amp; Run
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
