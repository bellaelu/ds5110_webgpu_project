import { useState, useRef, useEffect, useCallback } from "react";
import type { InferenceLatencySample } from "../types/metrics";
import type { VideoSourceType } from "../types/benchmark";
import WebcamCapture from "./WebcamCapture";
import DraggableContainer from "./DraggableContainer";
import PromptInput from "./PromptInput";
import LiveCaption from "./LiveCaption";
import PerformancePanel from "./PerformancePanel";
import BenchmarkPanel from "./BenchmarkPanel";
import { useVLMContext } from "../context/useVLMContext";
import { PROMPTS, TIMING } from "../constants";
import { usePerformanceMetrics } from "../hooks/usePerformanceMetrics";
import { useBenchmarkRecorder } from "../hooks/useBenchmarkRecorder";

interface CaptioningViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoFileName: string | null;
  videoSourceType: VideoSourceType;
  onOpenCompare: () => void;
}

function useCaptioningLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isRunning: boolean,
  promptRef: React.RefObject<string>,
  onCaptionUpdate: (caption: string) => void,
  onError: (error: string) => void,
  onLoopTick: (loopPeriodMs: number | null) => void,
  onInferenceEvent: (sample: InferenceLatencySample | null, skipped: boolean) => void,
) {
  const { isLoaded, runInference } = useVLMContext();
  const abortControllerRef = useRef<AbortController | null>(null);
  const onCaptionUpdateRef = useRef(onCaptionUpdate);
  const onErrorRef = useRef(onError);
  const onLoopTickRef = useRef(onLoopTick);
  const onInferenceEventRef = useRef(onInferenceEvent);

  useEffect(() => {
    onCaptionUpdateRef.current = onCaptionUpdate;
  }, [onCaptionUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoopTickRef.current = onLoopTick;
  }, [onLoopTick]);

  useEffect(() => {
    onInferenceEventRef.current = onInferenceEvent;
  }, [onInferenceEvent]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    if (!isRunning || !isLoaded) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const video = videoRef.current;
    const captureLoop = async () => {
      let lastLoopEnd = performance.now();
      while (!signal.aborted) {
        const loopStart = performance.now();
        const loopPeriodMs = loopStart - lastLoopEnd;
        lastLoopEnd = loopStart;

        if (video && video.readyState >= 2 && !video.paused && video.videoWidth > 0) {
          onLoopTickRef.current(loopPeriodMs);
          try {
            const currentPrompt = promptRef.current || "";
            const result = await runInference(video, currentPrompt, onCaptionUpdateRef.current);
            if (signal.aborted) break;
            onInferenceEventRef.current(result.latency ?? null, result.skipped);
            if (result.caption && !result.skipped) onCaptionUpdateRef.current(result.caption);
          } catch (error) {
            if (!signal.aborted) {
              const message = error instanceof Error ? error.message : String(error);
              onErrorRef.current(message);
              console.error("Error processing frame:", error);
            }
          }
        }
        if (signal.aborted) break;
        await new Promise((resolve) => setTimeout(resolve, TIMING.FRAME_CAPTURE_DELAY));
      }
    };

    setTimeout(captureLoop, 0);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [isRunning, isLoaded, runInference, promptRef, videoRef, onLoopTick, onInferenceEvent]);
}

export default function CaptioningView({
  videoRef,
  videoFileName,
  videoSourceType,
  onOpenCompare,
}: CaptioningViewProps) {
  const [caption, setCaption] = useState<string>("");
  const [isLoopRunning, setIsLoopRunning] = useState<boolean>(true);
  const [currentPrompt, setCurrentPrompt] = useState<string>(PROMPTS.default);
  const [error, setError] = useState<string | null>(null);

  const { stats: performanceStats, onLoopTick, onInferenceEvent } = usePerformanceMetrics(isLoopRunning);

  const statsRef = useRef(performanceStats);
  statsRef.current = performanceStats;
  const getStats = useCallback(() => statsRef.current, []);

  const benchmark = useBenchmarkRecorder({
    videoFileName,
    videoSourceType,
    prompt: currentPrompt,
    getStats,
  });

  const handleLoopTick = useCallback(
    (loopPeriodMs: number | null) => {
      onLoopTick(loopPeriodMs);
      benchmark.recordLoopTick(loopPeriodMs);
    },
    [onLoopTick, benchmark.recordLoopTick],
  );

  const handleInferenceEvent = useCallback(
    (sample: InferenceLatencySample | null, skipped: boolean) => {
      onInferenceEvent(sample, skipped);
      benchmark.recordInference(sample, skipped);
    },
    [onInferenceEvent, benchmark.recordInference],
  );

  const promptRef = useRef<string>(currentPrompt);

  useEffect(() => {
    promptRef.current = currentPrompt;
  }, [currentPrompt]);

  const handleCaptionUpdate = useCallback((newCaption: string) => {
    setCaption(newCaption);
    setError(null);
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setCaption(`Error: ${errorMessage}`);
  }, []);

  useCaptioningLoop(
    videoRef,
    isLoopRunning,
    promptRef,
    handleCaptionUpdate,
    handleError,
    handleLoopTick,
    handleInferenceEvent,
  );

  const handlePromptChange = useCallback((prompt: string) => {
    setCurrentPrompt(prompt);
    setError(null);
  }, []);

  const handleToggleLoop = useCallback(() => {
    setIsLoopRunning((prev) => !prev);
    if (error) setError(null);
  }, [error]);

  return (
    <div className="absolute inset-0 text-white">
      <div className="relative w-full h-full">
        <WebcamCapture isRunning={isLoopRunning} onToggleRunning={handleToggleLoop} error={error} />

        <DraggableContainer initialPosition={{ x: 20, y: 20 }}>
          <PerformancePanel stats={performanceStats} />
        </DraggableContainer>

        <DraggableContainer initialPosition={{ x: 20, y: 340 }}>
          <BenchmarkPanel
            status={benchmark.status}
            elapsedMs={benchmark.elapsedMs}
            durationSec={benchmark.durationSec}
            onDurationSecChange={benchmark.setDurationSec}
            customLabel={benchmark.customLabel}
            onCustomLabelChange={benchmark.setCustomLabel}
            browserInfo={benchmark.browserInfo}
            videoFileName={videoFileName}
            completedSession={benchmark.completedSession}
            onStart={benchmark.startRecording}
            onStop={benchmark.stopRecording}
            onReset={benchmark.resetRecorder}
            onExport={benchmark.exportSession}
            onOpenCompare={onOpenCompare}
          />
        </DraggableContainer>

        <DraggableContainer initialPosition="bottom-left">
          <PromptInput onPromptChange={handlePromptChange} />
        </DraggableContainer>

        <DraggableContainer initialPosition="bottom-right">
          <LiveCaption caption={caption} isRunning={isLoopRunning} error={error} />
        </DraggableContainer>
      </div>
    </div>
  );
}
