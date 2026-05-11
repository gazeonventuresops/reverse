import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useOneDrive } from "../context/OneDriveContext";
import { apiJson, downloadBlob } from "../api/client";
import {
  BarChart2, Image, Users, Download, LogOut, RefreshCw, Filter,
  Trash2, Plus, Package2, ExternalLink, X, Check, Eye, EyeOff,
  ChevronDown, Calendar, Store, TrendingUp, Camera, AlertCircle,
  UserPlus, Loader2, Settings, Wifi, WifiOff, CloudUpload, Info,
  Pencil, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { OneDriveThumbnail } from "../components/OneDriveThumbnail";

const STORES = ["SS Rajkot Nana Mava ES2", "SS Rajkot KKV Chowk ES4", "SS Rajkot Atika South ES6"];
const STORE_COLORS = ["#F8CC00", "#22C55E", "#3B82F6"];
type Tab = "dashboard" | "photos" | "users" | "settings";

interface Stats { total: number; todayCount: number; storeCount: Record<string, number>; dateCount: Record<string, number>; }
interface Photo {
  id: string; storeName: string; username: string; displayName: string;
  fullCrateName: string; crateType: string; photoType: string; date: string; timestamp: string;
  fileName: string; signedUrl: string | null; viewUrl: string | null;
  storageType?: string; oneDriveWebUrl?: string; oneDriveItemId?: string;
}
interface User { id: string; username: string; displayName: string; role: string; createdAt: string; }

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const getLast7Days = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().split("T")[0]; });

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardTab({ token }: { token: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setStats(await apiJson<Stats>("/stats", {}, token)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-yellow-400 animate-spin" /></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-red-400 text-sm">{error}<button onClick={load} className="ml-2 underline">Retry</button></div>;
  if (!stats) return null;

  const last7 = getLast7Days();
  const chartData = last7.map(d => ({ date: d.slice(5), count: stats.dateCount[d] || 0, full: d }));
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4">
          <p className="text-yellow-400/70 text-xs font-semibold uppercase tracking-wider">Today</p>
          <p className="text-yellow-400 text-3xl font-black mt-1">{stats.todayCount}</p>
          <p className="text-yellow-400/50 text-xs mt-0.5">photos</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">All Time</p>
          <p className="text-white text-3xl font-black mt-1">{stats.total}</p>
          <p className="text-gray-600 text-xs mt-0.5">total captures</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Store className="w-4 h-4 text-yellow-400" /> Store-wise Count</h3>
        <div className="space-y-2.5">
          {STORES.map((s, i) => {
            const cnt = stats.storeCount[s] || 0;
            const pct = stats.total > 0 ? Math.round((cnt / stats.total) * 100) : 0;
            return (
              <div key={s}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-gray-400 truncate max-w-[72%]">{s}</span>
                  <span className="text-xs font-bold" style={{ color: STORE_COLORS[i] }}>{cnt}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STORE_COLORS[i] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-yellow-400" /> Last 7 Days</h3>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#aaa" }} itemStyle={{ color: "#F8CC00" }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((e, i) => <Cell key={i} fill={e.full === today ? "#F8CC00" : "#F8CC0040"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-yellow-400" /> Date-wise Count</h3>
        <div className="space-y-1 max-h-52 overflow-auto">
          {Object.entries(stats.dateCount).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([d, cnt]) => (
            <div key={d} className="flex items-center justify-between py-1.5 px-2 hover:bg-white/5 rounded-lg">
              <span className="text-gray-400 text-xs font-mono">{d}</span>
              <span className="text-yellow-400 text-xs font-bold bg-yellow-400/10 px-2 py-0.5 rounded-full">{cnt} photos</span>
            </div>
          ))}
          {Object.keys(stats.dateCount).length === 0 && <p className="text-gray-600 text-xs text-center py-4">No captures yet</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 text-gray-500 hover:text-white text-xs transition"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
    </div>
  );
}

// ─── PHOTOS ───────────────────────────────────────────────────────────────────
function PhotosTab({ token }: { token: string | null }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [filterStore, setFilterStore] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCrate, setFilterCrate] = useState("");
  const [selected, setSelected] = useState<Photo | null>(null);

  // Dedicated ZIP download state
  const [zipStore, setZipStore] = useState("");
  const [zipDate, setZipDate] = useState(new Date().toISOString().split("T")[0]);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");

  const loadPhotos = useCallback(async (store = filterStore, date = filterDate, crate = filterCrate) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (store) params.set("storeName", store);
      if (date)  params.set("date", date);
      if (crate) params.set("crateId", crate);
      setPhotos(await apiJson<Photo[]>(`/photos?${params}`, {}, token));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, filterStore, filterDate, filterCrate]);

  // Auto-load on mount (no filters — all photos)
  useEffect(() => { loadPhotos("", "", ""); }, [token]);

  const downloadZipFiltered = async () => {
    setDownloading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterStore) params.set("storeName", filterStore);
      if (filterDate)  params.set("date", filterDate);
      const { blob, filename } = await downloadBlob(`/photos/download-zip?${params}`, token);
      triggerDownload(blob, filename);
    } catch (e: any) { setError(`Download failed: ${e.message}`); }
    finally { setDownloading(false); }
  };

  const downloadZipDirect = async () => {
    if (!zipDate) { setZipError("Please select a date."); return; }
    setZipLoading(true); setZipError("");
    try {
      const params = new URLSearchParams({ date: zipDate });
      if (zipStore) params.set("storeName", zipStore);
      const { blob, filename } = await downloadBlob(`/photos/download-zip?${params}`, token);
      triggerDownload(blob, filename);
    } catch (e: any) { setZipError(e.message || "No server photos found for this date/store."); }
    finally { setZipLoading(false); }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const serverPhotos   = photos.filter(p => p.storageType !== "onedrive" && (p.viewUrl || p.signedUrl));
  const oneDrivePhotos = photos.filter(p => p.storageType === "onedrive");

  return (
    <div className="space-y-4">
      {/* ── Date-wise ZIP Download (top, always visible) ── */}
      <div className="bg-green-500/8 border border-green-500/25 rounded-2xl p-4">
        <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-3">
          <Download className="w-4 h-4 text-green-400" /> Download ZIP by Date
        </h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select value={zipStore} onChange={e => setZipStore(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-green-400/40">
                <option value="" className="bg-[#1a1a1a]">All Stores</option>
                {STORES.map(s => <option key={s} value={s} className="bg-[#1a1a1a]">{s.replace("SS Rajkot ", "")}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
            </div>
            <input type="date" value={zipDate} onChange={e => setZipDate(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-400/40 [color-scheme:dark]" />
          </div>
          {zipError && <p className="text-red-400 text-xs">{zipError}</p>}
          <button onClick={downloadZipDirect} disabled={zipLoading || !zipDate}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold py-3 rounded-xl text-sm transition disabled:opacity-40">
            {zipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {zipLoading ? "Creating ZIP..." : `Download ${zipDate || "Select Date"} ZIP`}
          </button>
          <p className="text-gray-600 text-xs text-center">Downloads server-stored photos only · OneDrive photos: browse OneDrive directly</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <h3 className="text-white font-bold text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-yellow-400" /> Filter</h3>
        <div className="relative">
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
            <option value="" className="bg-[#1a1a1a]">All Stores</option>
            {STORES.map(s => <option key={s} value={s} className="bg-[#1a1a1a]">{s}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        </div>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/40 [color-scheme:dark]" />
        <input type="text" value={filterCrate} onChange={e => setFilterCrate(e.target.value)}
          placeholder="Search Crate ID..." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/40 font-mono" />
        <div className="flex gap-2">
          <button onClick={() => loadPhotos(filterStore, filterDate, filterCrate)} disabled={loading}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
            {loading ? "Loading..." : "Apply Filter"}
          </button>
          <button onClick={() => { setFilterStore(""); setFilterDate(""); setFilterCrate(""); loadPhotos("", "", ""); }}
            className="px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 rounded-xl text-sm transition" title="Clear filters">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-3"><AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-400 text-sm">{error}</p></div>}

      {/* Results header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-gray-500 text-xs">
          <span className="text-white font-bold">{photos.length}</span> photos
          {serverPhotos.length > 0 && <span className="text-gray-600"> · {serverPhotos.length} on server</span>}
          {oneDrivePhotos.length > 0 && <span className="text-blue-400"> · {oneDrivePhotos.length} on OneDrive</span>}
        </p>
        <div className="flex items-center gap-2">
          {oneDrivePhotos.length > 0 && (
            <a href="https://onedrive.live.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded-xl transition">
              <CloudUpload className="w-3 h-3" /> Browse OneDrive
            </a>
          )}
          {serverPhotos.length > 0 && (
            <button onClick={downloadZipFiltered} disabled={downloading}
              className="flex items-center gap-1.5 text-xs bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-xl transition disabled:opacity-40">
              {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {downloading ? "Zipping..." : `Download ZIP (${serverPhotos.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading && photos.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-yellow-400 animate-spin" /></div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {photos.map(photo => (
            <button key={photo.id} onClick={() => setSelected(photo)}
              className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400/30 rounded-xl overflow-hidden transition text-left">
              {photo.storageType === "onedrive" ? (
                <div className="aspect-video bg-black overflow-hidden border-b border-white/5">
                  <OneDriveThumbnail itemId={photo.oneDriveItemId || ""} />
                </div>
              ) : (photo.viewUrl || photo.signedUrl) ? (
                <div className="aspect-video bg-black overflow-hidden">
                  <img src={photo.viewUrl || photo.signedUrl || ""} alt={photo.fullCrateName} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="aspect-video bg-gray-800/50 flex items-center justify-center border-b border-white/5">
                  <Camera className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div className="p-2">
                <p className="text-yellow-400 text-xs font-mono font-bold truncate">{photo.fullCrateName}</p>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{(photo.storeName || "").replace("SS Rajkot ", "")}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-gray-600 text-xs">{photo.date}</span>
                  {photo.crateType === "COLD" && (
                    <span className="text-blue-400 text-xs font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">COLD</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-600">
          <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No photos found</p>
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111]">
            <div>
              <p className="text-yellow-400 font-bold text-sm font-mono">{selected.fullCrateName}</p>
              <p className="text-gray-500 text-xs">{selected.storeName}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black">
            {selected.storageType === "onedrive" ? (
              <div className="text-center space-y-4 w-full">
                <div className="max-w-md mx-auto aspect-video bg-black rounded-xl overflow-hidden mb-4">
                  <OneDriveThumbnail itemId={selected.oneDriveItemId || ""} />
                </div>
                <p className="text-white font-bold">{selected.fullCrateName}</p>
                <p className="text-gray-400 text-sm">Stored in OneDrive</p>
                <a href={selected.oneDriveWebUrl || undefined} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold px-5 py-3 rounded-xl text-sm transition">
                  <ExternalLink className="w-4 h-4" /> Open in OneDrive
                </a>
              </div>
            ) : (selected.viewUrl || selected.signedUrl) ? (
              <img src={selected.viewUrl || selected.signedUrl || ""} alt={selected.fullCrateName} className="max-w-full max-h-full rounded-xl" />
            ) : null}
          </div>
          <div className="px-4 py-3 border-t border-white/10 bg-[#111] grid grid-cols-3 gap-3 text-center text-xs">
            <div><p className="text-gray-600">Captured</p><p className="text-white mt-0.5">{fmtDate(selected.timestamp)}</p></div>
            <div><p className="text-gray-600">Storage</p><p className={`font-bold mt-0.5 ${selected.storageType === "onedrive" ? "text-blue-400" : "text-green-400"}`}>{selected.storageType === "onedrive" ? "OneDrive" : "Server"}</p></div>
            <div><p className="text-gray-600">By</p><p className="text-yellow-400 font-bold mt-0.5">@{selected.displayName || selected.username}</p></div>
          </div>
          {selected.viewUrl && selected.storageType !== "onedrive" && (
            <div className="px-4 pb-4 bg-[#111]">
              <a href={selected.viewUrl} download={selected.fileName} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black font-bold py-3 rounded-xl text-sm">
                <Download className="w-4 h-4" /> Download Photo
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── USER EDIT MODAL ──────────────────────────────────────────────────────────
function UserEditModal({ user, token, onClose, onSaved }: { user: User; token: string | null; onClose: () => void; onSaved: (u: User) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole]               = useState(user.role);
  const [newPwd, setNewPwd]           = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const updated = await apiJson<User>(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ displayName, role, newPassword: newPwd || undefined }),
      }, token);
      onSaved(updated);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/15 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold">Edit User</h3>
            <p className="text-gray-500 text-xs font-mono">@{user.username}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
        </div>

        {error && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5 mb-3"><AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-400 text-xs">{error}</p></div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400/40" />
          </div>

          {user.username !== "admin" && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Role</label>
              <div className="relative">
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
                  <option value="user" className="bg-[#1a1a1a]">User (Capture only)</option>
                  <option value="admin" className="bg-[#1a1a1a]">Admin (Full access)</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              New Password <span className="text-gray-600 normal-case font-normal">(leave blank to keep current)</span>
            </label>
            <div className="relative">
              <input type={showPwd ? "text" : "password"} value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="Enter new password..." minLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/40" />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Check className="w-3.5 h-3.5" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function UsersTab({ token }: { token: string | null }) {
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [fUser, setFUser]         = useState(""); const [fDisplay, setFDisplay] = useState("");
  const [fPwd, setFPwd]           = useState(""); const [fRole, setFRole] = useState<"user" | "admin">("user");
  const [showPwd, setShowPwd]     = useState(false);
  const [creating, setCreating]   = useState(false);
  const [createErr, setCreateErr] = useState(""); const [createOk, setCreateOk] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setUsers((await apiJson<User[]>("/users", {}, token)).sort((a, b) => a.role === "admin" ? -1 : 1)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setCreateErr(""); setCreateOk("");
    try {
      await apiJson("/users", { method: "POST", body: JSON.stringify({ username: fUser, displayName: fDisplay, password: fPwd, role: fRole }) }, token);
      setCreateOk(`User "${fUser}" created!`); setFUser(""); setFDisplay(""); setFPwd(""); setFRole("user"); setShowForm(false);
      await load();
    } catch (e: any) { setCreateErr(e.message); }
    finally { setCreating(false); }
  };

  const del = async (u: User) => {
    if (!confirm(`Delete "${u.username}"? Cannot be undone.`)) return;
    setDeletingId(u.id);
    try { await apiJson(`/users/${u.id}`, { method: "DELETE" }, token); setUsers(us => us.filter(x => x.id !== u.id)); }
    catch (e: any) { setError(e.message); }
    finally { setDeletingId(null); }
  };

  const handleSaved = (updated: User) => {
    setUsers(us => us.map(u => u.id === updated.id ? { ...u, ...updated } : u));
    setEditUser(null);
  };

  return (
    <div className="space-y-4">
      {createOk && <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/25 rounded-xl p-3"><CheckCircle2 className="w-4 h-4 text-green-400" /><p className="text-green-400 text-sm">{createOk}</p></div>}

      <button onClick={() => { setShowForm(!showForm); setCreateErr(""); setCreateOk(""); }}
        className="w-full flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-3 rounded-xl text-sm transition">
        <UserPlus className="w-4 h-4" /> {showForm ? "Cancel" : "Create New User"}
      </button>

      {showForm && (
        <form onSubmit={create} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <h3 className="text-white font-bold text-sm">New User</h3>
          {createErr && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5"><AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-400 text-xs">{createErr}</p></div>}
          <input type="text" value={fUser} onChange={e => setFUser(e.target.value)} placeholder="Username (login ID)" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/40 font-mono" />
          <input type="text" value={fDisplay} onChange={e => setFDisplay(e.target.value)} placeholder="Display Name (e.g. Ravi Kumar)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/40" />
          <div className="relative">
            <input type={showPwd ? "text" : "password"} value={fPwd} onChange={e => setFPwd(e.target.value)} placeholder="Password (min 6 chars)" required minLength={6} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/40" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">{showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
          </div>
          <div className="relative">
            <select value={fRole} onChange={e => setFRole(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
              <option value="user" className="bg-[#1a1a1a]">User (Capture only)</option>
              <option value="admin" className="bg-[#1a1a1a]">Admin (Full access)</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <button type="submit" disabled={creating} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
            {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</> : <><Plus className="w-3.5 h-3.5" /> Create User</>}
          </button>
        </form>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 text-red-400 text-sm">{error}</div>}

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-yellow-400 animate-spin" /></div> : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${u.role === "admin" ? "bg-yellow-400/20 text-yellow-400" : "bg-white/10 text-white"}`}>
                {(u.displayName || u.username).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{u.displayName || u.username}</p>
                <p className="text-gray-500 text-xs font-mono">@{u.username} · <span className={u.role === "admin" ? "text-yellow-400" : "text-gray-500"}>{u.role}</span></p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setEditUser(u)} className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition" title="Edit user">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {u.username !== "admin" && (
                  <button onClick={() => del(u)} disabled={deletingId === u.id} className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition disabled:opacity-40" title="Delete user">
                    {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No users</p>}
        </div>
      )}

      {/* Edit modal */}
      {editUser && <UserEditModal user={editUser} token={token} onClose={() => setEditUser(null)} onSaved={handleSaved} />}
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsTab({ token }: { token: string | null }) {
  const od = useOneDrive();
  const [clientId, setClientId] = useState(localStorage.getItem("od_client_id") || "");
  const [saved, setSaved]       = useState(false);

  // Cleanup state
  const [cleanPeriod, setCleanPeriod]     = useState("90");
  const [cleanPreview, setCleanPreview]   = useState<{ count: number; cutoffDate: string; supabaseCount: number; oneDriveCount: number } | null>(null);
  const [cleanLoading, setCleanLoading]   = useState(false);
  const [cleaning, setCleaning]           = useState(false);
  const [cleanResult, setCleanResult]     = useState<{ deleted: number; storageDeleted: number } | null>(null);
  const [cleanError, setCleanError]       = useState("");

  const saveClientId = () => {
    localStorage.setItem("od_client_id", clientId.trim());
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    window.location.reload();
  };

  const previewCleanup = async () => {
    setCleanLoading(true); setCleanError(""); setCleanResult(null);
    try { setCleanPreview(await apiJson(`/photos/cleanup-preview?olderThanDays=${cleanPeriod}`, {}, token)); }
    catch (e: any) { setCleanError(e.message); }
    finally { setCleanLoading(false); }
  };

  const doCleanup = async () => {
    if (!cleanPreview) return;
    if (!confirm(`Permanently delete ${cleanPreview.count} photos before ${cleanPreview.cutoffDate}?\n\nServer photos will be deleted from storage. OneDrive photos will only have their records removed (actual files stay in OneDrive).\n\nThis cannot be undone.`)) return;
    setCleaning(true); setCleanError("");
    try {
      const result = await apiJson(`/photos/cleanup?olderThanDays=${cleanPeriod}`, { method: "DELETE" }, token);
      setCleanResult(result); setCleanPreview(null);
    } catch (e: any) { setCleanError(e.message); }
    finally { setCleaning(false); }
  };

  return (
    <div className="space-y-5">
      {/* ── OneDrive Setup ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center"><CloudUpload className="w-5 h-5 text-blue-400" /></div>
          <div><h3 className="text-white font-bold text-sm">OneDrive Integration</h3><p className="text-gray-500 text-xs">Direct upload to your Microsoft OneDrive</p></div>
        </div>

        <div className={`flex items-center gap-2 rounded-xl p-3 mb-4 ${od.isConnected ? "bg-green-500/10 border border-green-500/25" : od.isConfigured ? "bg-orange-500/10 border border-orange-500/25" : "bg-white/5 border border-white/10"}`}>
          {od.isConnected
            ? <><Wifi className="w-4 h-4 text-green-400 flex-shrink-0" /><div><p className="text-green-400 text-xs font-semibold">Connected</p><p className="text-green-400/70 text-xs">{od.userEmail || od.userName}</p></div></>
            : od.isConfigured
            ? <><WifiOff className="w-4 h-4 text-orange-400 flex-shrink-0" /><p className="text-orange-400 text-xs">Configured — click below to sign in</p></>
            : <><Info className="w-4 h-4 text-gray-500 flex-shrink-0" /><p className="text-gray-500 text-xs">Enter Client ID to configure</p></>
          }
        </div>

        <div className="space-y-2 mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Azure App Client ID</label>
          <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono" />
          <div className="flex gap-2">
            <button onClick={saveClientId} disabled={!clientId.trim()}
              className="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
              {saved ? <><Check className="w-3.5 h-3.5" /> Saved!</> : "Save Client ID"}
            </button>
            {od.clientId && <button onClick={() => { localStorage.removeItem("od_client_id"); window.location.reload(); }} className="px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 rounded-xl text-sm transition"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        </div>

        {od.isConfigured && (od.isConnected ? (
          <button onClick={od.disconnect} className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-semibold py-3 rounded-xl text-sm transition">
            <WifiOff className="w-4 h-4" /> Disconnect OneDrive
          </button>
        ) : (
          <button onClick={od.connect} disabled={od.isConnecting}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-sm transition disabled:opacity-40">
            {od.isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {od.isConnecting ? "Opening sign-in..." : "Sign in to Microsoft"}
          </button>
        ))}

        {od.error && <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5"><AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-400 text-xs">{od.error}</p></div>}
      </div>

      {/* ── Azure Setup Guide ── */}
      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-4">
        <h4 className="text-yellow-400 font-bold text-sm mb-3 flex items-center gap-2"><Info className="w-4 h-4" /> Azure App Setup (one-time)</h4>
        <ol className="space-y-2 text-xs text-gray-400">
          {[
            <>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Azure Portal → App Registrations → New Registration</a></>,
            <>Set <strong className="text-white">Supported account types</strong>: "Accounts in any org directory and personal Microsoft accounts"</>,
            <>Set <strong className="text-white">Platform</strong>: Single Page Application → Redirect URI:</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-2"><span className="text-yellow-400 font-bold flex-shrink-0">{i + 1}.</span><span>{step}</span></li>
          ))}
        </ol>
        <div className="mt-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2 mb-2">
          <p className="text-green-400 text-xs font-mono break-all">{window.location.origin}</p>
        </div>
        <ol start={4} className="space-y-2 text-xs text-gray-400">
          {[
            <>Copy <strong className="text-white">Application (client) ID</strong> → paste above</>,
            <>Under <strong className="text-white">API Permissions</strong>, add <code className="text-yellow-400">Files.ReadWrite.All</code> (Microsoft Graph, Delegated)</>,
            <>Click <strong className="text-white">"Sign in to Microsoft"</strong> button above</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-2"><span className="text-yellow-400 font-bold flex-shrink-0">{i + 4}.</span><span>{step}</span></li>
          ))}
        </ol>
        <p className="text-gray-600 text-xs mt-3">Photos saved to: <code className="text-yellow-400">/RC_Logger/StoreName/YYYY-MM-DD/</code></p>
      </div>

      {/* ── Data Cleanup ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 bg-red-500/15 rounded-xl flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-400" /></div>
          <div><h3 className="text-white font-bold text-sm">Delete Old Data</h3><p className="text-gray-500 text-xs">Free up server & storage space</p></div>
        </div>

        {cleanResult && (
          <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/25 rounded-xl p-3 mb-4">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-green-400 text-sm">Deleted <strong>{cleanResult.deleted}</strong> records and <strong>{cleanResult.storageDeleted}</strong> server files.</p>
          </div>
        )}
        {cleanError && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-4"><AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-400 text-sm">{cleanError}</p></div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Delete photos older than</label>
            <div className="relative">
              <select value={cleanPeriod} onChange={e => { setCleanPeriod(e.target.value); setCleanPreview(null); setCleanResult(null); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-400/40">
                <option value="30" className="bg-[#1a1a1a]">1 Month (30 days)</option>
                <option value="60" className="bg-[#1a1a1a]">2 Months (60 days)</option>
                <option value="90" className="bg-[#1a1a1a]">3 Months (90 days)</option>
                <option value="180" className="bg-[#1a1a1a]">6 Months (180 days)</option>
                <option value="365" className="bg-[#1a1a1a]">1 Year (365 days)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {cleanPreview && (
            <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-orange-300 text-sm font-semibold">{cleanPreview.count} photos will be deleted</p>
                  <p className="text-orange-400/70 text-xs mt-1">Before {cleanPreview.cutoffDate} · {cleanPreview.supabaseCount} on server · {cleanPreview.oneDriveCount} on OneDrive (records only)</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={previewCleanup} disabled={cleanLoading}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
              {cleanLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
              Preview
            </button>
            {cleanPreview && cleanPreview.count > 0 && (
              <button onClick={doCleanup} disabled={cleaning}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {cleaning ? "Deleting..." : `Delete ${cleanPreview.count}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function AdminPage() {
  const { user, token, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (!user) { navigate("/", { replace: true }); return; }
    if (!isAdmin) navigate("/capture", { replace: true });
  }, [user, isAdmin]);

  const tabs = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: <BarChart2 className="w-4 h-4" /> },
    { id: "photos"    as Tab, label: "Photos",    icon: <Image className="w-4 h-4" /> },
    { id: "users"     as Tab, label: "Users",     icon: <Users className="w-4 h-4" /> },
    { id: "settings"  as Tab, label: "Settings",  icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="bg-[#111] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0"><Package2 className="w-4 h-4 text-black" /></div>
          <div><p className="text-white font-bold text-sm leading-none">RC Logger</p><p className="text-yellow-400 text-xs leading-none mt-0.5 font-semibold">Admin Panel</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/capture")}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition border border-white/10">
            <Camera className="w-3.5 h-3.5" /> Capture
          </button>
          <button onClick={() => { logout(); navigate("/", { replace: true }); }} className="p-2 text-gray-500 hover:text-white transition rounded-lg hover:bg-white/5">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-[#0f0f0f] border-b border-white/10 px-2 overflow-x-auto">
        <div className="flex min-w-max">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${activeTab === tab.id ? "border-yellow-400 text-yellow-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4">
          {activeTab === "dashboard" && <DashboardTab token={token} />}
          {activeTab === "photos"    && <PhotosTab token={token} />}
          {activeTab === "users"     && <UsersTab token={token} />}
          {activeTab === "settings"  && <SettingsTab token={token} />}
        </div>
      </div>
    </div>
  );
}