import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Upload } from 'lucide-react';

interface VoiceRecorderProps {
  audioDataUrl: string | null;
  audioMimeType: string | null;
  onAudioChange: (dataUrl: string | null, mimeType: string | null) => void;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  audioDataUrl,
  onAudioChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCleanup = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopCleanup();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawIdle = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barCount = 44;
      const gap = 4;
      const barWidth = (width - gap * (barCount - 1)) / barCount;
      ctx.fillStyle = '#D1D5DB';
      for (let i = 0; i < barCount; i++) {
        const barH = 6;
        const x = i * (barWidth + gap);
        const y = (height - barH) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 3);
        ctx.fill();
      }
    };

    if (!isRecording || !analyserRef.current) {
      drawIdle();
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const drawLive = () => {
      const { width, height } = canvas;
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      const barCount = 44;
      const gap = 4;
      const barWidth = (width - gap * (barCount - 1)) / barCount;
      const step = Math.max(1, Math.floor(bufferLength / barCount));

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] || 0;
        const norm = val / 255;
        const barH = Math.max(6, norm * (height - 8));
        const x = i * (barWidth + gap);
        const y = (height - barH) / 2;
        ctx.fillStyle = norm > 0.15 ? '#2B6CB0' : '#93C5FD';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(drawLive);
    };

    rafRef.current = requestAnimationFrame(drawLive);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    setMicError(null);
    onAudioChange(null, null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const cleanMime = preferredMime.split(';')[0];
        const blob = new Blob(chunksRef.current, { type: cleanMime });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            onAudioChange(reader.result, cleanMime);
          }
        };
        reader.readAsDataURL(blob);
        stopCleanup();
      };

      recorder.start(100);
      setElapsedSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      stopCleanup();
      setIsRecording(false);
      setMicError(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}. You can upload an audio clip instead.`
          : 'Microphone permission was denied. You can upload an audio clip instead.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMicError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        onAudioChange(reader.result, file.type || 'audio/mpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-[3px] border border-slate-300 bg-[#F8FAFC] p-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="ehr-btn-primary"
            >
              <Mic className="h-3.5 w-3.5" />
              Record voice note
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#C53030] border border-[#9B2C2C] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#9B2C2C] whitespace-nowrap"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop recording
            </button>
          )}

          <span className="font-mono text-[13px] font-semibold text-slate-700 tabular-nums">
            {formatDuration(elapsedSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording}
            className="ehr-btn-secondary"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload audio
          </button>
        </div>
      </div>

      <div className="mt-2.5 rounded-[2px] bg-white px-3 py-2 border border-slate-200">
        <canvas
          ref={canvasRef}
          width={560}
          height={40}
          className="h-10 w-full"
          aria-label="Live audio waveform"
        />
      </div>

      {audioDataUrl && !isRecording ? (
        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[2px] bg-white p-2 border border-slate-200">
          <audio controls src={audioDataUrl} className="h-8 w-full sm:max-w-md" />
          <button
            type="button"
            onClick={() => {
              onAudioChange(null, null);
              setElapsedSeconds(0);
            }}
            className="ehr-btn-secondary"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : null}

      {micError ? (
        <p className="mt-2 text-[12px] text-red-700">{micError}</p>
      ) : null}
    </div>
  );
};
