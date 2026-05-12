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

export function CapturePage() {
  const { user, token, storeName, logout } = useAuth();
  const navigate = useNavigate();
  const oneDrive = useOneDrive(); // This object should contain isConfigured, isConnected, and uploadPhoto

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
  const [activeTab, setActiveTab] = useState<"capture" | "history">("capture");

  // History tab state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCrate, setFilterCrate] = useState("");
  const [selected, setSelected] = useState<Photo | null>(null);

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
        console.warn("Video play error:", e);
        setCameraError("Video preview failed. Try again.");
      });
    }
  }, [cameraActive]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraReady(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

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
      setCameraError(err.name === "NotAllowedError" ? "Camera permission denied." : `Camera error: ${err.message}`);
    }
  }, [facingMode]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const now = new Date();
    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > 800 || h > 600) {
      const r = Math.min(800 / w, 600 / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    
    // Stamp logic
    const bannerH = Math.max(72, Math.round(h * 0.16));
    ctx.fillStyle = "rgba(0,0,0,0.84)";
    ctx.fillRect(0, h - bannerH, w, bannerH);
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.fillRect(0, h - bannerH, w, 3);
    
    // Convert to DataURL
    let quality = 0.82;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    setCapturedPhoto(dataUrl);
    setCapturedAt(now);
    stopCamera();
  };

  const submitPhoto = async () => {
    if (!capturedPhoto || !cratePrefix || !crateSuffix) {
      setSubmitError("Missing crate number or photo."); return;
    }

    // Check OneDrive Status from the context object
    if (!oneDrive.isConfigured || !oneDrive.isConnected) {
      setSubmitError("Please connect OneDrive first using the button in the header.");
      return;
    }

    setUploading(true); 
    setSubmitError("");

    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;
    const ts = capturedAt || new Date();
    const date = ts.toISOString().split("T")[0];
    const tStr = ts.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const fname = `${fullCrateName}_${tStr}.jpg`;

    try {
      setUploadStep("Uploading to OneDrive...");
      const res = await oneDrive.uploadPhoto(capturedPhoto, storeName, fname, date);

      const record: Photo = {
        id: res.itemId,
        storeName,
        username: user?.username || "",
        displayName: user?.displayName || user?.username || "",
        fullCrateName,
        crateType,
        photoType: "capture",
        date,
        timestamp: ts.toISOString(),
        fileName: fname,
        signedUrl: null,
        viewUrl: null,
        storageType: "onedrive",
        oneDriveWebUrl: res.webUrl,
        oneDriveItemId: res.itemId,
      };

      const existing: Photo[] = JSON.parse(localStorage.getItem("rc_photos") || "[]");
      existing.unshift(record);
      localStorage.setItem("rc_photos", JSON.stringify(existing.slice(0, 500)));

      setCapturedPhoto(null); setCapturedAt(null); setCrateSuffix("");
      setSuccess(true); setSessionCount(c => c + 1);
      setTimeout(() => setSuccess(false), 3500);
      await startCamera();
    } catch (e: any) {
      setSubmitError(`OneDrive upload failed: ${e.message}`);
    } finally {
      setUploading(false); setUploadStep("");
    }
  };

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      if (filterCrate) params.set("crateId", filterCrate);
      const data = await apiJson<Photo[]>(`/photos?${params.toString()}`, {}, token);
      setPhotos(data);
    } catch (e: any) {
      setHistoryError("Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, [token, filterDate, filterCrate]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  const canCapture = cratePrefix.trim().length > 0 && crateSuffix.trim().length > 0;

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
            <p className="text-gray-500 text-xs leading-none mt-0.5">{storeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {oneDrive.isConfigured && (
            <button 
              onClick={oneDrive.isConnected ? undefined : oneDrive.connect} 
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition ${
                oneDrive.isConnected 
                ? "bg-blue-500/15 border-blue-500/30 text-blue-400" 
                : "bg-orange-500/15 border-orange-500/30 text-orange-400"
              }`}
            >
              {oneDrive.isConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
              {oneDrive.isConnected ? "Connected" : "Connect OneDrive"}
            </button>
          )}
          <button onClick={() => { stopCamera(); logout(); navigate("/"); }} className="p-2 text-gray-500 hover:text-white"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#111] border-b border-white/10 flex px-2 sticky top-[53px] z-10">
        <button onClick={() => setActiveTab("capture")} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === "capture" ? "border-yellow-400 text-yellow-400" : "border-transparent text-gray-50"}`}>Capture</button>
        <button onClick={() => { setActiveTab("history"); stopCamera(); }} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === "history" ? "border-yellow-400 text-yellow-400" : "border-transparent text-gray-50"}`}>History</button>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-lg mx-auto w-full">
        {activeTab === "capture" ? (
          <div className="space-y-4">
            {/* Input Row */}
            <div className="flex gap-2">
              <input type="tel" value={cratePrefix} onChange={e => setCratePrefix(e.target.value)} placeholder="Prefix" className="w-20 bg-white/5 border border-white/10 rounded-xl p-3 text-white text-center" />
              <select value={crateType} onChange={e => setCrateType(e.target.value as CrateType)} className="bg-white/5 border border-white/10 rounded-xl p-3 text-white">
                <option value="PERM">PERM</option>
                <option value="COLD">COLD</option>
              </select>
              <input type="tel" value={crateSuffix} onChange={e => setCrateSuffix(e.target.value)} placeholder="Suffix" className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white" />
            </div>

            {submitError && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex gap-2"><AlertCircle className="w-4 h-4" /> {submitError}</div>}
            {success && <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-xl flex gap-2"><CheckCircle className="w-4 h-4" /> Upload Success!</div>}

            <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111]">
              {capturedPhoto ? (
                <div className="flex flex-col">
                  <img src={capturedPhoto} alt="Preview" className="w-full" />
                  <div className="p-3 flex gap-2">
                    <button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="flex-1 py-3 bg-white/5 text-white rounded-xl">Retake</button>
                    <button onClick={submitPhoto} disabled={uploading} className="flex-[2] py-3 bg-yellow-400 text-black font-bold rounded-xl flex items-center justify-center gap-2">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save to OneDrive
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {cameraActive ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-80 object-cover" />
                      <button onClick={capturePhoto} disabled={!canCapture} className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 border-white" style={{ backgroundColor: CRATE_TYPE_COLORS[crateType] }} />
                    </>
                  ) : (
                    <div className="py-20 text-center">
                      <button onClick={() => startCamera()} className="bg-yellow-400 px-8 py-3 rounded-xl font-bold">Open Camera</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-20">History Loading...</div>
        )}
      </div>
    </div>
  );
}
