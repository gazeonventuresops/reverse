import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useOneDrive } from "../context/OneDriveContext";
import { apiJson } from "../api/client";
import {
  Camera, RotateCcw, Save, LogOut, CheckCircle, AlertCircle,
  Package2, Shield, FlipHorizontal, CloudUpload, Wifi, WifiOff,
  Loader2, X, ChevronDown, History, Image, Search, Calendar,
  Filter, ExternalLink, Download, RefreshCw,
} from "lucide-react";
import { OneDriveThumbnail } from "../components/OneDriveThumbnail";

const CRATE_TYPES = ["PERM", "COLD"] as const;
type CrateType = typeof CRATE_TYPES[number];

const CRATE_TYPE_COLORS: Record<CrateType, string> = {
  PERM: "#F8CC00", // yellow
  COLD: "#3B82F6", // blue
};

function getBase64Size(dataUrl: string): number {
  return Math.round((dataUrl.split(",")[1] || "").length * 0.75);
}

interface Photo {
  id: string; storeName: string; username: string; displayName: string;
  fullCrateName: string; crateType: string; photoType: string; date: string; timestamp: string;
  fileName: string; signedUrl: string | null; viewUrl: string | null;
  storageType?: string; oneDriveWebUrl?: string; oneDriveItemId?: string;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

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
  const [activeTab, setActiveTab]       = useState<"capture" | "history">("capture");
  
  // History tab state
  const [photos, setPhotos]   = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [filterDate, setFilterDate]   = useState("");
  const [filterCrate, setFilterCrate] = useState("");
  const [selected, setSelected]       = useState<Photo | null>(null);

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
    if (!w || !h) { setCameraError("Camera stream invalid. Please restart."); return; }
    
    if (w > 800 || h > 600) {
      const r = Math.min(800 / w, 600 / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { setCameraError("Canvas error. Try again."); return; }

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

    // ── Compress to ≤100 KB ────────────────────────────────────────────────
    let quality = 0.82;
    let dataUrl  = canvas.toDataURL("image/jpeg", quality);
    // Increased target to 100KB for better visibility/preview
    while (getBase64Size(dataUrl) > 100 * 1024 && quality > 0.1) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
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

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setHistoryError("");
    try {
      const params = new URLSearchParams();
      if (filterDate)  params.set("date", filterDate);
      if (filterCrate) params.set("crateId", filterCrate);
      
      const query = params.toString();
      const endpoint = query ? `/photos?${query}` : "/photos";
      
      const data = await apiJson<Photo[]>(endpoint, {}, token);
      setPhotos(data);
    } catch (e: any) {
      console.error("History load failed:", e);
      setHistoryError(e.message || "Failed to load history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, filterDate, filterCrate]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  const handleLogout = () => { stopCamera(); logout(); navigate("/", { replace: true }); };

  const canCapture   = cratePrefix.trim().length > 0 && crateSuffix.trim().length > 0;
  const fullCrateName = canCapture ? `${cratePrefix}_${crateType}_${crateSuffix}` : null;
  const sizeKB       = capturedPhoto ? Math.round(getBase64Size(capturedPhoto) / 1024) : 0;
  const typeColor    = CRATE_TYPE_COLORS[crateType];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
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
              <div className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] px-2 py-0.5 rounded-full">
                <Wifi className="w-2.5 h-2.5" /> OD
              </div>
            ) : (
              <button onClick={oneDrive.connect} disabled={oneDrive.isConnecting}
                className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] px-2 py-0.5 rounded-full hover:bg-orange-500/25 transition">
                {oneDrive.isConnecting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <WifiOff className="w-2.5 h-2.5" />}
                Connect
              </button>
            )
          ) : null}
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-white transition rounded-lg hover:bg-white/5">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#111] border-b border-white/10 flex px-2 sticky top-[53px] z-10">
        <button onClick={() => { setActiveTab("capture"); setSuccess(false); }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition ${activeTab === "capture" ? "border-yellow-400 text-yellow-400" : "border-transparent text-gray-500"}`}>
          <Camera className="w-4 h-4" /> Capture
        </button>
        <button onClick={() => { setActiveTab("history"); setSuccess(false); stopCamera(); }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition ${activeTab === "history" ? "border-yellow-400 text-yellow-400" : "border-transparent text-gray-500"}`}>
          <History className="w-4 h-4" /> My History
        </button>
      </div>

      <div className="flex-1 overflow-auto pb-8">
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {activeTab === "capture" ? (
            <>
              {/* Crate Number Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Crate Number <span className="text-yellow-400">*</span>
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    type="tel" inputMode="numeric"
                    value={cratePrefix}
                    onChange={e => setCratePrefix(e.target.value.replace(/\D/g, ""))}
                    placeholder="81" maxLength={10}
                    className="w-[76px] bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition"
                  />
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
                  <input
                    type="tel" inputMode="numeric"
                    value={crateSuffix}
                    onChange={e => setCrateSuffix(e.target.value.replace(/\D/g, ""))}
                    placeholder="00006637" maxLength={12}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition"
                  />
                </div>
              </div>

              {/* Alerts */}
              {success && (
                <div className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/25 rounded-xl p-3">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-400 text-sm font-medium">Photo saved{oneDrive.isConnected ? " to OneDrive" : " to server"}!</p>
                </div>
              )}
              {(cameraError || submitError) && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{cameraError || submitError}</p>
                </div>
              )}

              {/* Camera Area */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111]">
                {capturedPhoto ? (
                  <div>
                    <div className="relative">
                      <img src={capturedPhoto} alt="Preview" className="w-full block" />
                      <div className="absolute top-2 right-2 flex gap-1.5">
                        <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-lg font-mono">{sizeKB}KB</span>
                      </div>
                    </div>
                    <div className="p-3 bg-[#0f0f0f] flex gap-2">
                      <button onClick={retake} disabled={uploading} className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-40"><RotateCcw className="w-4 h-4" /> Retake</button>
                      <button onClick={submitPhoto} disabled={uploading} className="flex-[2] flex items-center justify-center gap-1.5 bg-yellow-400 text-black font-black py-3 rounded-xl text-sm disabled:opacity-40">
                        {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Submit</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className={`relative bg-black ${cameraActive ? "block" : "hidden"}`}>
                      <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setCameraReady(true)} className="w-full block max-h-[65vh] object-cover" />
                      <button onClick={capturePhoto} disabled={!canCapture || !cameraReady} className="absolute left-1/2 -translate-x-1/2 bottom-8 w-16 h-16 rounded-full flex items-center justify-center border-4 border-black shadow-xl" style={{ backgroundColor: typeColor }}><Camera className="w-7 h-7 text-black" /></button>
                      <button onClick={flipCamera} className="absolute top-3 right-3 bg-black/50 p-2 rounded-xl"><FlipHorizontal className="w-4 h-4 text-white" /></button>
                      <button onClick={stopCamera} className="absolute top-3 left-3 bg-black/50 p-2 rounded-xl"><X className="w-4 h-4 text-white" /></button>
                    </div>
                    {!cameraActive && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Camera className="w-12 h-12 text-gray-700 mb-4" />
                        <button onClick={() => startCamera()} disabled={!canCapture} className="bg-yellow-400 text-black font-black px-10 py-3.5 rounded-xl disabled:opacity-30">Open Camera</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#111] border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-yellow-400" /> My History</h3>
                  <button onClick={loadHistory} className="text-gray-500 hover:text-yellow-400 transition"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex gap-2">
                  <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white [color-scheme:dark]" />
                  <input type="text" value={filterCrate} onChange={e => setFilterCrate(e.target.value)} placeholder="Crate ID..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono" />
                </div>
              </div>

              {historyError && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-red-400 text-sm font-medium">{historyError}</p>
                    <button onClick={loadHistory} className="text-red-400/70 text-xs underline mt-1 hover:text-red-400 transition">Try Again</button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
              ) : photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map(p => (
                    <button key={p.id} onClick={() => setSelected(p)} className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden text-left">
                      {p.storageType === "onedrive" ? <OneDriveThumbnail itemId={p.oneDriveItemId || ""} /> : (p.viewUrl || p.signedUrl) ? <img src={p.viewUrl || p.signedUrl || ""} alt="capture" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-white/5 flex items-center justify-center"><Image className="w-6 h-6 text-gray-700" /></div>}
                      <div className="p-2.5">
                        <p className="text-yellow-400 text-xs font-bold font-mono truncate">{p.fullCrateName}</p>
                        <p className="text-gray-600 text-[10px] mt-1">{p.date}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 text-gray-600">No photos found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/98 z-[100] flex flex-col p-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-yellow-400 font-mono font-bold">{selected.fullCrateName}</p>
            <button onClick={() => setSelected(null)} className="p-2 bg-white/5 rounded-xl"><X className="w-6 h-6 text-white" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto">
            {selected.storageType === "onedrive" ? (
              <div className="text-center space-y-4">
                <div className="rounded-2xl overflow-hidden max-w-sm mx-auto shadow-2xl"><OneDriveThumbnail itemId={selected.oneDriveItemId || ""} /></div>
                <a href={selected.oneDriveWebUrl || undefined} target="_blank" rel="noopener noreferrer" className="inline-block bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold"><ExternalLink className="w-4 h-4 inline mr-2" /> View Original</a>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <img src={selected.viewUrl || selected.signedUrl || ""} alt="Capture" className="max-w-full rounded-2xl shadow-2xl" />
                <a href={selected.viewUrl || selected.signedUrl || ""} download className="inline-block bg-yellow-400 text-black px-6 py-3 rounded-xl text-sm font-black"><Download className="w-4 h-4 inline mr-2" /> Download</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}