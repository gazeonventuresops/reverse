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
  const navigate  = useNavigate();
  const oneDrive  = useOneDrive();

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clockRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form
  const [cratePrefix, setCratePrefix] = useState("");
  const [crateType, setCrateType]     = useState<CrateType>("PERM");
  const [crateSuffix, setCrateSuffix] = useState("");

  // Camera
  const [cameraActive, setCameraActive]   = useState(false);
  const [cameraReady, setCameraReady]     = useState(false);
  const [facingMode, setFacingMode]       = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError]     = useState("");

  // Capture
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedAt, setCapturedAt]       = useState<Date | null>(null);

  // Submit
  const [uploading, setUploading]     = useState(false);
  const [uploadStep, setUploadStep]   = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess]         = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!user) { navigate("/", { replace: true }); return; }
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [user]);

  // Attach stream → video after camera becomes active
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
      streamRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: m }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true); // triggers useEffect to attach stream
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Allow access in browser settings."
        : err.name === "NotFoundError"
        ? "No camera found on this device."
        : `Camera error: ${err.message}`;
      setCameraError(msg);
    }
  }, [facingMode]);

  const flipCamera = async () => {
    const m = facingMode === "environment" ? "user" : "environment";
    setFacingMode(m);
    await startCamera(m);
  };

  // ── Capture photo ──────────────────────────────────────────────────────────
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setCameraError("Video not ready. Wait a moment."); return; }

    const now = new Date();
    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;

    // Scale to max 800×600
    let w = video.videoWidth, h = video.videoHeight;
    if (w > 800 || h > 600) {
      const r = Math.min(800 / w, 600 / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(video, 0, 0, w, h);

    // ── Stamp overlay ────────────────────────────────────────────────────────
    const bannerH = Math.max(72, Math.round(h * 0.16));
    const pad = 10;

    ctx.fillStyle = "rgba(0,0,0,0.84)";
    ctx.fillRect(0, h - bannerH, w, bannerH);

    // Top accent line — color by crate type
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.fillRect(0, h - bannerH, w, 3);

    const fs1 = Math.max(14, Math.round(w * 0.026));
    const fs2 = Math.max(11, Math.round(w * 0.019));
    const lineH = Math.round(bannerH / 3.2);

    // Line 1 — Crate name
    ctx.font = `bold ${fs1}px 'Courier New', monospace`;
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.textAlign = "left";
    ctx.fillText(fullCrateName, pad, h - bannerH + lineH);

    // Type badge
    ctx.fillStyle = crateType === "COLD" ? "#3B82F6" : "#1a1a1a";
    ctx.fillRect(w - fs1 * 3.2 - pad, h - bannerH + 6, fs1 * 3.2, fs1 + 8);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${fs2}px 'Courier New', monospace`;
    ctx.textAlign = "right";
    ctx.fillText(`[${crateType}]`, w - pad, h - bannerH + lineH + 2);

    // Line 2 — Date & Time
    ctx.font = `${fs2}px 'Courier New', monospace`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    const ds = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const ts = now.toLocaleTimeString("en-IN", { hour12: false });
    ctx.fillText(`${ds}  ${ts}`, pad, h - bannerH + lineH * 2.1);

    // Line 3 — Store + @username
    ctx.fillStyle = "#999";
    ctx.fillText(storeName, pad, h - bannerH + lineH * 3.1);
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.font = `bold ${fs2}px 'Courier New', monospace`;
    ctx.textAlign = "right";
    ctx.fillText(`@${user?.displayName || user?.username}`, w - pad, h - bannerH + lineH * 3.1);
    ctx.textAlign = "left";

    // ── Compress to ≤50 KB ────────────────────────────────────────────────
    let quality = 0.78;
    let dataUrl  = canvas.toDataURL("image/jpeg", quality);
    while (getBase64Size(dataUrl) > 52 * 1024 && quality > 0.08) {
      quality = Math.max(0.08, quality - 0.07);
      dataUrl  = canvas.toDataURL("image/jpeg", quality);
    }

    setCapturedPhoto(dataUrl);
    setCapturedAt(now);
    stopCamera();
    setSubmitError("");
  };

  const retake = async () => {
    setCapturedPhoto(null); setCapturedAt(null); setSubmitError("");
    await startCamera();
  };

  // ── Submit photo ───────────────────────────────────────────────────────────
  const submitPhoto = async () => {
    if (!capturedPhoto || !cratePrefix || !crateSuffix) {
      setSubmitError("Missing crate number or photo."); return;
    }
    setUploading(true); setSubmitError("");

    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;
    const ts    = capturedAt || new Date();
    const date  = ts.toISOString().split("T")[0];
    const tStr  = ts.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const fname = `${fullCrateName}_${tStr}.jpg`;

    let odItemId: string | undefined;
    let odWebUrl: string | undefined;
    let storageType: "onedrive" | "supabase" = "supabase";

    // Try OneDrive first
    if (oneDrive.isConfigured && oneDrive.isConnected) {
      try {
        setUploadStep("Uploading to OneDrive...");
        const res = await oneDrive.uploadPhoto(capturedPhoto, storeName, fname, date);
        odItemId = res.itemId; odWebUrl = res.webUrl;
        storageType = "onedrive";
      } catch (e: any) {
        setSubmitError(`OneDrive failed: ${e.message}. Saved to server instead.`);
        storageType = "supabase";
      }
    }

    try {
      setUploadStep(storageType === "onedrive" ? "Saving record..." : "Uploading photo...");
      await apiJson("/photos/upload", {
        method: "POST",
        body: JSON.stringify({
          storeName, cratePrefix: cratePrefix.trim(), crateType,
          crateSuffix: crateSuffix.trim(), photoType: "capture",
          timestamp: ts.toISOString(), fileName: fname,
          photoData:       storageType === "supabase" ? capturedPhoto : undefined,
          oneDriveItemId:  storageType === "onedrive" ? odItemId : undefined,
          oneDriveWebUrl:  storageType === "onedrive" ? odWebUrl  : undefined,
          storageType,
        }),
      }, token);

      setCapturedPhoto(null); setCapturedAt(null); setCrateSuffix("");
      setSuccess(true); setSessionCount(c => c + 1);
      setTimeout(() => setSuccess(false), 3500);
      await startCamera();
    } catch (e: any) {
      setSubmitError(`Save failed: ${e.message}`);
    } finally {
      setUploading(false); setUploadStep("");
    }
  };

  const handleLogout = () => { stopCamera(); logout(); navigate("/", { replace: true }); };

  const canCapture   = cratePrefix.trim().length > 0 && crateSuffix.trim().length > 0;
  const fullCrateName = canCapture ? `${cratePrefix}_${crateType}_${crateSuffix}` : null;
  const sizeKB       = capturedPhoto ? Math.round(getBase64Size(capturedPhoto) / 1024) : 0;
  const typeColor    = CRATE_TYPE_COLORS[crateType];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* ── Header ── */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <Package2 className="w-4 h-4 text-black" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">RC Logger</p>
            <p className="text-gray-500 text-xs leading-none mt-0.5 truncate max-w-[150px]">{storeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {oneDrive.isConfigured ? (
            oneDrive.isConnected ? (
              <div className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs px-2 py-1 rounded-full">
                <Wifi className="w-3 h-3" /> OneDrive
              </div>
            ) : (
              <button onClick={oneDrive.connect} disabled={oneDrive.isConnecting}
                className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs px-2 py-1 rounded-full hover:bg-orange-500/25 transition">
                {oneDrive.isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                Connect OD
              </button>
            )
          ) : null}
          {sessionCount > 0 && (
            <span className="text-xs bg-yellow-400/15 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-semibold">
              {sessionCount} saved
            </span>
          )}
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-white transition rounded-lg hover:bg-white/5">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-8">
        <div className="max-w-lg mx-auto p-4 space-y-4">

          {/* ── Crate Number: [prefix] [PERM/COLD ▾] [suffix] ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Crate Number <span className="text-yellow-400">*</span>
            </label>
            <div className="flex items-stretch gap-2">
              {/* Prefix — digits only */}
              <input
                type="tel" inputMode="numeric"
                value={cratePrefix}
                onChange={e => setCratePrefix(e.target.value.replace(/\D/g, ""))}
                placeholder="81" maxLength={10}
                className="w-[76px] bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition"
              />

              {/* PERM / COLD dropdown */}
              <div className="relative flex-shrink-0">
                <select
                  value={crateType}
                  onChange={e => setCrateType(e.target.value as CrateType)}
                  className="appearance-none h-full rounded-xl px-3 pr-7 py-3 text-sm font-black font-mono border focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition cursor-pointer"
                  style={{
                    backgroundColor: crateType === "PERM" ? "rgba(248,204,0,0.15)" : "rgba(59,130,246,0.15)",
                    borderColor:     crateType === "PERM" ? "rgba(248,204,0,0.35)" : "rgba(59,130,246,0.35)",
                    color:           typeColor,
                  }}
                >
                  {CRATE_TYPES.map(t => (
                    <option key={t} value={t} className="bg-[#1a1a1a] text-white">{t}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: typeColor }} />
              </div>

              {/* Suffix — digits only */}
              <input
                type="tel" inputMode="numeric"
                value={crateSuffix}
                onChange={e => setCrateSuffix(e.target.value.replace(/\D/g, ""))}
                placeholder="00006637" maxLength={12}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition"
              />
            </div>

            {fullCrateName && (
              <div className="mt-2 flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5">
                <Shield className="w-3 h-3 flex-shrink-0" style={{ color: typeColor }} />
                <span className="text-xs font-mono text-gray-400">
                  ID: <span className="font-bold" style={{ color: typeColor }}>{fullCrateName}</span>
                </span>
              </div>
            )}
          </div>

          {/* ── Alerts ── */}
          {success && (
            <div className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/25 rounded-xl p-3">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm font-medium">
                Photo saved{oneDrive.isConnected ? " to OneDrive" : " to server"}!
              </p>
            </div>
          )}
          {(cameraError || submitError) && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{cameraError || submitError}</p>
            </div>
          )}
          {oneDrive.error && (
            <div className="flex items-start gap-2.5 bg-orange-500/10 border border-orange-500/25 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-orange-400 text-sm">{oneDrive.error}</p>
            </div>
          )}

          {/* ── Camera / Preview ── */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111]">
            {capturedPhoto ? (
              /* Preview mode */
              <div>
                <div className="relative">
                  <img src={capturedPhoto} alt="Preview" className="w-full block" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-lg font-mono">{sizeKB}KB</span>
                    {oneDrive.isConnected && (
                      <span className="bg-blue-500/80 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                        <CloudUpload className="w-3 h-3" /> OD
                      </span>
                    )}
                  </div>
                </div>

                {/* Info below preview */}
                <div className="px-4 py-2.5 bg-[#0f0f0f] border-t border-white/5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Crate</span>
                    <span className="font-mono font-bold" style={{ color: typeColor }}>{fullCrateName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Store</span>
                    <span className="text-gray-300 text-right max-w-[60%] truncate">{storeName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Type</span>
                    <span className="font-bold" style={{ color: typeColor }}>{crateType}</span>
                  </div>
                </div>

                {uploading && uploadStep && (
                  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-500/10 border-t border-blue-500/20">
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                    <p className="text-blue-400 text-xs">{uploadStep}</p>
                  </div>
                )}

                <div className="flex gap-2 p-3 bg-[#0f0f0f]">
                  <button onClick={retake} disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40">
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button onClick={submitPhoto} disabled={uploading}
                    className="flex-[2] flex items-center justify-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black py-3 rounded-xl text-sm transition disabled:opacity-40">
                    {uploading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Submit Photo</>}
                  </button>
                </div>
              </div>
            ) : (
              /* Camera / idle mode */
              <div>
                {/* Video — ALWAYS rendered, hidden when inactive */}
                <div className={`relative bg-black ${cameraActive ? "block" : "hidden"}`}>
                  <video ref={videoRef} autoPlay playsInline muted
                    onCanPlay={() => setCameraReady(true)}
                    className="w-full block max-h-[65vh] object-cover"
                  />

                  {/* Live stamp preview */}
                  {cameraReady && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/82 px-3 py-2"
                      style={{ borderTop: `2px solid ${typeColor}55` }}>
                      <p className="font-bold text-xs font-mono truncate" style={{ color: typeColor }}>
                        {fullCrateName || "ENTER CRATE NUMBER"}
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: crateType === "COLD" ? "#3B82F6" : "#0a0a0a", border: `1px solid ${typeColor}55` }}>
                          {crateType}
                        </span>
                      </p>
                      <p className="text-white/70 text-xs font-mono mt-0.5">
                        {currentTime.toLocaleDateString("en-IN")}  {currentTime.toLocaleTimeString("en-IN", { hour12: false })}
                      </p>
                      <p className="text-gray-400 text-xs font-mono flex justify-between mt-0.5">
                        <span className="truncate max-w-[65%]">{storeName}</span>
                        <span style={{ color: typeColor }}>@{user?.displayName || user?.username}</span>
                      </p>
                    </div>
                  )}

                  {/* Capture button */}
                  <button onClick={capturePhoto} disabled={!canCapture || !cameraReady}
                    className="absolute left-1/2 -translate-x-1/2 bottom-[5.5rem] w-16 h-16 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-all border-[3px] border-black disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: typeColor }}>
                    <Camera className="w-7 h-7 text-black" />
                  </button>

                  {/* Flip */}
                  <button onClick={flipCamera}
                    className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white p-2 rounded-xl transition">
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                  {/* Close */}
                  <button onClick={stopCamera}
                    className="absolute top-3 left-3 bg-black/50 hover:bg-black/70 text-white p-2 rounded-xl transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Idle */}
                {!cameraActive && (
                  <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                      <Camera className="w-9 h-9 text-gray-600" />
                    </div>
                    <p className="text-gray-400 text-sm font-medium mb-1">
                      {canCapture ? "Ready to capture" : "Enter crate number above"}
                    </p>
                    {fullCrateName && (
                      <p className="text-xs mb-5 font-mono" style={{ color: typeColor }}>{fullCrateName}</p>
                    )}
                    {!fullCrateName && (
                      <p className="text-gray-700 text-xs mb-5">Fill in crate number to enable camera</p>
                    )}
                    <button onClick={() => startCamera()} disabled={!canCapture}
                      className="text-black font-black px-8 py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition text-sm shadow-lg"
                      style={{ backgroundColor: canCapture ? typeColor : "#555", boxShadow: canCapture ? `0 8px 20px ${typeColor}35` : "none" }}>
                      Open Camera
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hints */}
          {!canCapture && !capturedPhoto && (
            <p className="text-gray-700 text-xs text-center flex items-center justify-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Enter numeric crate prefix and suffix to activate camera
            </p>
          )}
          {!oneDrive.isConfigured && (
            <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-3">
              <CloudUpload className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <p className="text-gray-500 text-xs">
                OneDrive not set up — photos saved to server.{" "}
                {user?.role === "admin" && (
                  <button onClick={() => navigate("/admin")} className="text-yellow-400 underline">Configure in Admin</button>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
