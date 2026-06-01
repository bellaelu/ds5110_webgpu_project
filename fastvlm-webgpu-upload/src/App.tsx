import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import LoadingScreen from "./components/LoadingScreen";
import CaptioningView from "./components/CaptioningView";
import WelcomeScreen from "./components/WelcomeScreen";
import WebcamPermissionDialog from "./components/WebcamPermissionDialog";
import BenchmarkCompareView from "./components/BenchmarkCompareView";
import type { AppState } from "./types";
import type { VideoSourceType } from "./types/benchmark";

export default function App() {
  const [appState, setAppState] = useState<AppState>("welcome");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>("camera");
  const [showCompare, setShowCompare] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handlePermissionGranted = useCallback((stream: MediaStream) => {
    // Clean up any previous source
    setFileUrl((prev: string | null) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    stopStreamTracks(mediaStream);

    setMediaStream(stream);
    setVideoFileName(null);
    setVideoSourceType("camera");
    setAppState("welcome");
  }, []);

  const handleStart = useCallback(() => {
    setAppState("loading");
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setAppState("captioning");
  }, []);

  const playVideo = useCallback(async (video: HTMLVideoElement) => {
    try {
      await video.play();
    } catch (error) {
      console.error("Failed to play video:", error);
    }
  }, []);

  const setupVideo = useCallback(
    (video: HTMLVideoElement, source: { stream?: MediaStream; url?: string | null }) => {
      // Reset current src/srcObject first
      video.pause();
      video.src = "";
      (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = null;

      if (source.stream) {
        (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = source.stream;
      } else if (source.url) {
        video.src = source.url;
      }

      const handleCanPlay = () => {
        setIsVideoReady(true);
        playVideo(video);
      };

      video.addEventListener("canplay", handleCanPlay, { once: true });

      return () => {
        video.removeEventListener("canplay", handleCanPlay);
      };
    },
    [playVideo],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const cleanup = setupVideo(video, { stream: mediaStream ?? undefined, url: fileUrl });
    return cleanup;
  }, [mediaStream, fileUrl, setupVideo]);

  const stopStreamTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch (e) {
        // ignore
      }
    });
  };

  const handleSelectCamera = useCallback(() => {
    // Move to permission flow; component will request permission
    setAppState("requesting-permission");
  }, []);

  const handleSelectDisplay = useCallback(async () => {
    try {
      // Clean up previous
      stopStreamTracks(mediaStream);
      setMediaStream(null);
      setFileUrl((prev: string | null) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });

      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen capture not supported in this browser");
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      setMediaStream(stream);
      setVideoFileName(null);
      setVideoSourceType("display");
      setAppState("welcome");
    } catch (e) {
      console.error("Failed to start display capture:", e);
      // Stay on welcome; user can retry
    }
  }, [mediaStream]);

  const handleSelectFile = useCallback((file: File) => {
    // Clean up previous sources
    stopStreamTracks(mediaStream);
    setMediaStream(null);
    setFileUrl((prev: string | null) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setVideoFileName(file.name);
    setVideoSourceType("file");
    setAppState("welcome");
  }, [mediaStream]);

  const videoBlurState = useMemo(() => {
    switch (appState) {
      case "requesting-permission":
        return "blur(20px) brightness(0.2) saturate(0.5)";
      case "welcome":
        return "blur(12px) brightness(0.3) saturate(0.7)";
      case "loading":
        return "blur(8px) brightness(0.4) saturate(0.8)";
      case "captioning":
        return "none";
      default:
        return "blur(20px) brightness(0.2) saturate(0.5)";
    }
  }, [appState]);

  return (
    <div className="App relative h-screen overflow-hidden">
      <div className="absolute inset-0 bg-gray-900" />

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        loop={Boolean(fileUrl)}
        className="absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-out"
        style={{
          filter: videoBlurState,
          opacity: isVideoReady ? 1 : 0,
        }}
      />

      {appState !== "captioning" && <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" />}

      {appState === "requesting-permission" && <WebcamPermissionDialog onPermissionGranted={handlePermissionGranted} />}

      {appState === "welcome" && (
        <WelcomeScreen
          onStart={handleStart}
          onSelectCamera={handleSelectCamera}
          onSelectDisplay={handleSelectDisplay}
          onSelectFile={handleSelectFile}
          isSourceReady={Boolean(mediaStream) || Boolean(fileUrl)}
          onOpenCompare={() => setShowCompare(true)}
        />
      )}

      {appState === "loading" && <LoadingScreen onComplete={handleLoadingComplete} />}

      {appState === "captioning" && (
        <CaptioningView
          videoRef={videoRef}
          videoFileName={videoFileName}
          videoSourceType={videoSourceType}
          onOpenCompare={() => setShowCompare(true)}
        />
      )}

      {showCompare && <BenchmarkCompareView onClose={() => setShowCompare(false)} />}
    </div>
  );
}
