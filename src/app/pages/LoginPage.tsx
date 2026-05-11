import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../api/client";
import { AlertCircle, Package2, Eye, EyeOff, ChevronDown, Store } from "lucide-react";

const STORES = [
  "SS Rajkot Nana Mava ES2",
  "SS Rajkot KKV Chowk ES4",
  "SS Rajkot Atika South ES6",
];

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Admin doesn't need store selection
    if (!selectedStore && username.trim().toLowerCase() !== "admin") {
      setError("Please select your store before logging in.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await apiJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      // For admin, store is optional
      const storeToSave = data.user.role === "admin" ? (selectedStore || "") : selectedStore;
      login(data.token, data.user, storeToSave);
      navigate(data.user.role === "admin" ? "/admin" : "/capture", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = username.trim().toLowerCase() === "admin";

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 via-transparent to-green-600/5 pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-400 rounded-3xl mb-4 shadow-lg shadow-yellow-400/25">
            <Package2 className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">RC Logger</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Reverse Consignment · Blinkit</p>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-5">Sign In</h2>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-400/40 transition text-sm"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-400/40 transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Store selection — always shown for non-admin, optional label for admin */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" />
                Your Store {!isAdmin && <span className="text-yellow-400">*</span>}
                {isAdmin && <span className="text-gray-600 normal-case font-normal">(optional for admin)</span>}
              </label>
              <div className="relative">
                <select
                  value={selectedStore}
                  onChange={e => setSelectedStore(e.target.value)}
                  required={!isAdmin}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-yellow-400/40 transition text-sm cursor-pointer"
                >
                  <option value="" className="bg-[#1a1a1a] text-gray-400">
                    {isAdmin ? "Select store (optional)..." : "Select your store..."}
                  </option>
                  {STORES.map(s => (
                    <option key={s} value={s} className="bg-[#1a1a1a] text-white">{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              {selectedStore && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-green-400 text-xs font-medium">{selectedStore}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password || (!selectedStore && !isAdmin)}
              className="w-full bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-black py-3.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm tracking-wide mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Hint */}
        <div className="mt-4 bg-yellow-400/10 border border-yellow-400/20 rounded-xl p-3">
          <p className="text-yellow-400/80 text-xs text-center font-medium">
            Default admin: <span className="font-mono font-bold text-yellow-400">admin</span> / <span className="font-mono font-bold text-yellow-400">Admin@123</span>
          </p>
        </div>

        <p className="text-center text-gray-700 text-xs mt-4">
          For internal use only · Blinkit Operations
        </p>
      </div>
    </div>
  );
}
