import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useOneDrive } from "../hooks/useOneDrive";
import { apiJson } from "../api/client";
import {
  Camera, RotateCcw, Save, LogOut, CheckCircle, AlertCircle,
  Package2, Shield, FlipHorizontal, CloudUpload, Wifi, WifiOff,
  Loader2, X, ChevronDown,
} from "lucide-react";

const CRATE_TYPES = ["PERM", "COLD"] as const;
type CrateType = typeof CRATE_TYPES[number];

const CRATE_TYPE_COLORS: Record<CrateType, string> = {
  PERM: "#F8CC00", // yellow
  COLD: "#3B82F6", // blue
};

function getBase64Size(dataUrl: string): number {
  return Math.round((dataUrl.split(",")[1] || "").length * 0.75);
}

export function CapturePage() {
  const { user, token, storeName, logout } = useAuth();
  const navigate = useNavigate();
  const oneDrive = useOneDrive();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form
  const [cratePrefix, setCratePrefix] = useState("");
  const [crateType, setCrateType] = useState<CrateType>("PERM");
  const [crateSuffix, setCrateSuffix] = useState("");

  // Camera
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState("");

  // Capture
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);

  // Submit
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!user) { navigate("/", { replace: true }); return; }
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [user, navigate]);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => {
        console.warn("Video play:", e);
        setCameraError("Video preview failed. Try again.");
      });
    }
  }, [cameraActive]);

  useEffect(() => () => stopCamera(), []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (mode?: "environment" | "user") => {
    const m = mode ?? facingMode;
    setCameraError("");
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: m }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied."
        : "No camera found or error occurred.";
      setCameraError(msg);
    }
  }, [facingMode]);

  const flipCamera = async () => {
    const m = facingMode === "environment" ? "user" : "environment";
    setFacingMode(m);
    await startCamera(m);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setCameraError("Video not ready."); return; }

    const now = new Date();
    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;

    let w = video.videoWidth, h = video.videoHeight;
    if (w > 800 || h > 600) {
      const r = Math.min(800 / w, 600 / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    const bannerH = Math.max(72, Math.round(h * 0.16));
    const pad = 10;
    ctx.fillStyle = "rgba(0,0,0,0.84)";
    ctx.fillRect(0, h - bannerH, w, bannerH);
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.fillRect(0, h - bannerH, w, 3);

    const fs1 = Math.max(14, Math.round(w * 0.026));
    const fs2 = Math.max(11, Math.round(w * 0.019));
    const lineH = Math.round(bannerH / 3.2);

    ctx.font = `bold ${fs1}px 'Courier New', monospace`;
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.textAlign = "left";
    ctx.fillText(fullCrateName, pad, h - bannerH + lineH);

    ctx.font = `${fs2}px 'Courier New', monospace`;
    ctx.fillStyle = "#FFFFFF";
    const ds = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const ts = now.toLocaleTimeString("en-IN", { hour12: false });
    ctx.fillText(`${ds}  ${ts}`, pad, h - bannerH + lineH * 2.1);

    ctx.fillStyle = "#999";
    ctx.fillText(storeName, pad, h - bannerH + lineH * 3.1);

    let quality = 0.80;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (getBase64Size(dataUrl) > 55 * 1024 && quality > 0.1) {
      quality -= 0.05;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    setCapturedPhoto(dataUrl);
    setCapturedAt(now);
    stopCamera();
  };

  const retake = async () => {
    setCapturedPhoto(null); setCapturedAt(null); setSubmitError("");
    await startCamera();
  };

  const submitPhoto = async () => {
    if (!capturedPhoto || !cratePrefix || !crateSuffix) {
      setSubmitError("Missing crate number or photo."); return;
    }
    setUploading(true);
    setSubmitError("");

    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;
    const ts = capturedAt || new Date();
    const dateDir = ts.toISOString().split("T")[0];
    const tStr = ts.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const fname = `${fullCrateName}_${tStr}.jpg`;

    let odItemId: string | undefined;
    let odWebUrl: string | undefined;
    let storageType: "onedrive" | "supabase" = "supabase";

    // ── ONEDRIVE UPLOAD LOGIC ──
    if (oneDrive.isConfigured && oneDrive.isConnected) {
      try {
        setUploadStep("Uploading to OneDrive...");
        const res = await oneDrive.uploadPhoto(capturedPhoto, storeName, fname, dateDir);
        
        if (res && (res.itemId || res.id)) {
          odItemId = res.itemId || res.id;
          odWebUrl = res.webUrl;
          storageType = "onedrive";
          console.log("OneDrive Upload Success:", odItemId);
        } else {
          throw new Error("OneDrive returned an empty response.");
        }
      } catch (e: any) {
        console.error("OD Error:", e);
        setSubmitError(`OneDrive failed: ${e.message}. Saving to server...`);
        storageType = "supabase";
      }
    } else {
      console.warn("OneDrive not connected. Defaulting to server storage.");
      storageType = "supabase";
    }

    // ── DATABASE RECORD SAVE ──
    try {
      setUploadStep(storageType === "onedrive" ? "Saving record..." : "Uploading photo to server...");
      await apiJson("/photos/upload", {
        method: "POST",
        body: JSON.stringify({
          storeName, cratePrefix: cratePrefix.trim(), crateType,
          crateSuffix: crateSuffix.trim(), photoType: "capture",
          timestamp: ts.toISOString(), fileName: fname,
          photoData: storageType === "supabase" ? capturedPhoto : undefined,
          oneDriveItemId: odItemId,
          oneDriveWebUrl: odWebUrl,
          storageType,
        }),
      }, token);

      setCapturedPhoto(null); setCapturedAt(null); setCrateSuffix("");
      setSuccess(true); setSessionCount(c => c + 1);
      setTimeout(() => setSuccess(false), 3000);
      await startCamera();
    } catch (e: any) {
      setSubmitError(`Database Save failed: ${e.message}`);
    } finally {
      setUploading(false); setUploadStep("");
    }
  };

  const handleLogout = () => { stopCamera(); logout(); navigate("/", { replace: true }); };

  const canCapture = cratePrefix.trim().length > 0 && crateSuffix.trim().length > 0;
  const fullCrateName = canCapture ? `${cratePrefix}_${crateType}_${crateSuffix}` : null;
  const sizeKB = capturedPhoto ? Math.round(getBase64Size(capturedPhoto) / 1024) : 0;
  const typeColor = CRATE_TYPE_COLORS[crateType];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col font-sans">
      {/* Header */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <Package2 className="w-4 h-4 text-black" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">RC Logger</p>
            <p className="text-gray-500 text-xs mt-1 truncate max-w-[120px]">{storeName}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {oneDrive.isConfigured && (
            oneDrive.isConnected ? (
              <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] uppercase font-bold px-2 py-1 rounded-full">
                <Wifi className="w-3 h-3" /> Connected
              </div>
            ) : (
              <button onClick={oneDrive.connect} className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] uppercase font-bold px-2 py-1 rounded-full">
                <WifiOff className="w-3 h-3" /> Connect OD
              </button>
            )
          )}
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-white transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-md mx-auto w-full space-y-4">
        {/* Input Section */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Crate Identifier</label>
          <div className="flex gap-2">
            <input type="tel" value={cratePrefix} placeholder="Prefix" 
              onChange={e => setCratePrefix(e.target.value.replace(/\D/g, ""))}
              className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-mono focus:ring-2 focus:ring-yellow-400 outline-none transition" />
            
            <div className="relative flex-1">
              <select value={crateType} onChange={e => setCrateType(e.target.value as CrateType)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold font-mono outline-none cursor-pointer"
                style={{ color: typeColor, borderColor: `${typeColor}44` }}>
                {CRATE_TYPES.map(t => <option key={t} value={t} className="bg-black text-white">{t}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none opacity-50" />
            </div>

            <input type="tel" value={crateSuffix} placeholder="Suffix" 
              onChange={e => setCrateSuffix(e.target.value.replace(/\D/g, ""))}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white font-mono focus:ring-2 focus:ring-yellow-400 outline-none transition" />
          </div>
        </div>

        {/* Status Messages */}
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4" /> Photo saved successfully!
          </div>
        )}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {submitError}
          </div>
        )}

        {/* Display / Camera Area */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#111] shadow-2xl">
          {capturedPhoto ? (
            <div className="animate-in fade-in duration-300">
              <img src={capturedPhoto} alt="Captured" className="w-full" />
              <div className="p-4 bg-black/40 backdrop-blur-md flex flex-col gap-3">
                <div className="flex justify-between items-center">
                   <span className="text-gray-400 text-xs font-mono">{sizeKB} KB</span>
                   <span className="text-white font-mono font-bold" style={{ color: typeColor }}>{fullCrateName}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={retake} disabled={uploading} className="flex-1 bg-white/5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-white/10 active:scale-95 transition">
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button onClick={submitPhoto} disabled={uploading} className="flex-[2] bg-yellow-400 text-black py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {uploading ? "Uploading..." : "Save Photo"}
                  </button>
                </div>
                {uploadStep && <p className="text-blue-400 text-[10px] text-center animate-pulse">{uploadStep}</p>}
              </div>
            </div>
          ) : (
            <div className="aspect-[3/4] flex flex-col">
              {cameraActive ? (
                <div className="relative flex-1 bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" onCanPlay={() => setCameraReady(true)} />
                  <div className="absolute top-4 left-4 right-4 flex justify-between">
                    <button onClick={stopCamera} className="p-2 bg-black/50 rounded-full text-white"><X className="w-5 h-5" /></button>
                    <button onClick={flipCamera} className="p-2 bg-black/50 rounded-full text-white"><FlipHorizontal className="w-5 h-5" /></button>
                  </div>
                  <button onClick={capturePhoto} disabled={!cameraReady || !canCapture}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 border-white/30 flex items-center justify-center active:scale-90 transition disabled:opacity-20"
                    style={{ backgroundColor: typeColor }}>
                    <Camera className="w-8 h-8 text-black" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-gray-600">
                    <Camera className="w-8 h-8" />
                  </div>
                  <p className="text-gray-400 text-sm">
                    {canCapture ? "Everything looks good." : "Enter crate details to enable camera."}
                  </p>
                  <button onClick={() => startCamera()} disabled={!canCapture}
                    className="px-8 py-3 rounded-xl font-bold text-sm transition active:scale-95 disabled:opacity-20 shadow-lg"
                    style={{ backgroundColor: typeColor, color: '#000' }}>
                    Open Camera
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
