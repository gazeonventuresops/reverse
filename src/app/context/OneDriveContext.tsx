/**
 * OneDrive Context — singleton state shared across all components.
 * Auth via Microsoft OAuth2 + PKCE (no MSAL).
 * App.tsx detects popup callback (?code=…) and postMessages it here.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// ── localStorage keys ────────────────────────────────────────────────────────
const KEY_CLIENT_ID     = "od_client_id";
const KEY_ACCESS_TOKEN  = "od_access_token";
const KEY_REFRESH_TOKEN = "od_refresh_token";
const KEY_TOKEN_EXPIRY  = "od_token_expiry";   // epoch ms
const KEY_USER_EMAIL    = "od_user_email";
const KEY_USER_NAME     = "od_user_name";
const KEY_PKCE_VERIFIER = "od_pkce_verifier";

const SCOPES   = "Files.ReadWrite.All User.Read offline_access";
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// ── PKCE ─────────────────────────────────────────────────────────────────────
async function genPKCE() {
  const arr      = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const digest   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { verifier, challenge };
}

async function exchangeCode(code: string, clientId: string, verifier: string) {
  const body = new URLSearchParams({ client_id: clientId, code, redirect_uri: window.location.origin, grant_type: "authorization_code", code_verifier: verifier, scope: SCOPES });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error_description || e.error || "Token exchange failed"); }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function doRefresh(refreshToken: string, clientId: string) {
  const body = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token", scope: SCOPES });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

function storeTokens(t: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(KEY_ACCESS_TOKEN, t.access_token);
  if (t.refresh_token) localStorage.setItem(KEY_REFRESH_TOKEN, t.refresh_token);
  localStorage.setItem(KEY_TOKEN_EXPIRY, String(Date.now() + t.expires_in * 1000));
}

function clearTokens() {
  [KEY_ACCESS_TOKEN, KEY_REFRESH_TOKEN, KEY_TOKEN_EXPIRY, KEY_USER_EMAIL, KEY_USER_NAME].forEach(k => localStorage.removeItem(k));
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface OneDriveUploadResult { itemId: string; webUrl: string; name: string; }

interface CtxType {
  isConfigured: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string;
  userName: string;
  userEmail: string;
  clientId: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  uploadPhoto: (dataUrl: string, storeName: string, fileName: string, date: string) => Promise<OneDriveUploadResult>;
  deletePhoto: (itemId: string) => Promise<void>;
  getThumbnail: (itemId: string) => Promise<string | null>;
  saveClientId: (id: string) => void;
}

const Ctx = createContext<CtxType>({
  isConfigured: false, isConnected: false, isConnecting: false,
  error: "", userName: "", userEmail: "", clientId: "",
  connect: async () => {}, disconnect: () => {},
  uploadPhoto: async () => ({ itemId: "", webUrl: "", name: "" }),
  deletePhoto: async () => {},
  getThumbnail: async () => null,
  saveClientId: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function OneDriveProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected]   = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError]               = useState("");
  const [userName, setUserName]         = useState("");
  const [userEmail, setUserEmail]       = useState("");
  const [clientId, setClientId]         = useState(localStorage.getItem(KEY_CLIENT_ID) || "");

  const isConfigured = !!clientId;

  // Check stored tokens on mount
  useEffect(() => {
    const token  = localStorage.getItem(KEY_ACCESS_TOKEN);
    const expiry = parseInt(localStorage.getItem(KEY_TOKEN_EXPIRY) || "0");
    const ref    = localStorage.getItem(KEY_REFRESH_TOKEN);
    if (token && (expiry > Date.now() || ref)) {
      setIsConnected(true);
      setUserEmail(localStorage.getItem(KEY_USER_EMAIL) || "");
      setUserName(localStorage.getItem(KEY_USER_NAME)  || "");
    }
  }, []);

  const saveClientId = useCallback((id: string) => {
    const trimmed = id.trim();
    localStorage.setItem(KEY_CLIENT_ID, trimmed);
    setClientId(trimmed);
  }, []);

  // Get a valid access token, auto-refreshing if needed
  const getToken = useCallback(async (): Promise<string | null> => {
    const cid     = localStorage.getItem(KEY_CLIENT_ID) || "";
    const token   = localStorage.getItem(KEY_ACCESS_TOKEN);
    const expiry  = parseInt(localStorage.getItem(KEY_TOKEN_EXPIRY) || "0");
    const ref     = localStorage.getItem(KEY_REFRESH_TOKEN);

    if (!cid || !token) return null;

    // Still valid (5-min buffer)
    if (expiry > Date.now() + 5 * 60 * 1000) return token;

    // Try refresh
    if (!ref) { disconnect(); return null; }
    try {
      const tokens = await doRefresh(ref, cid);
      storeTokens(tokens);
      return tokens.access_token;
    } catch {
      disconnect();
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTokens();
    setIsConnected(false);
    setUserEmail("");
    setUserName("");
  }, []);

  const connect = useCallback(async () => {
    const cid = localStorage.getItem(KEY_CLIENT_ID) || "";
    if (!cid) { setError("Client ID not configured. Set it in Admin → Settings first."); return; }

    setIsConnecting(true);
    setError("");
    try {
      const { verifier, challenge } = await genPKCE();
      localStorage.setItem(KEY_PKCE_VERIFIER, verifier);

      const params = new URLSearchParams({
        client_id: cid, response_type: "code", redirect_uri: window.location.origin,
        scope: SCOPES, code_challenge: challenge, code_challenge_method: "S256",
        response_mode: "query", prompt: "select_account",
      });

      const popup = window.open(`${AUTH_URL}?${params}`, "od_auth", "width=520,height=680,popup=yes,noopener=no");
      if (!popup) { setError("Popup was blocked — please allow popups for this site and try again."); setIsConnecting(false); return; }

      const code = await new Promise<string>((resolve, reject) => {
        let done = false;

        const msgHandler = (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin || ev.data?.type !== "od_auth_callback") return;
          done = true;
          window.removeEventListener("message", msgHandler);
          clearInterval(closedPoll);
          ev.data.error ? reject(new Error(ev.data.errorDesc || ev.data.error)) : resolve(ev.data.code);
        };
        window.addEventListener("message", msgHandler);

        const closedPoll = setInterval(() => {
          if (popup.closed && !done) {
            done = true; clearInterval(closedPoll);
            window.removeEventListener("message", msgHandler);
            reject(new Error("Sign-in window closed before completing. Please try again."));
          }
        }, 800);

        setTimeout(() => {
          if (!done) { done = true; clearInterval(closedPoll); window.removeEventListener("message", msgHandler); popup.close(); reject(new Error("Sign-in timed out.")); }
        }, 8 * 60 * 1000);
      });

      const pkceV  = localStorage.getItem(KEY_PKCE_VERIFIER) || "";
      localStorage.removeItem(KEY_PKCE_VERIFIER);
      const tokens = await exchangeCode(code, cid, pkceV);
      storeTokens(tokens);

      // Fetch user profile
      try {
        const me = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then(r => r.json());
        const email = me.mail || me.userPrincipalName || "";
        const name  = me.displayName || email;
        localStorage.setItem(KEY_USER_EMAIL, email);
        localStorage.setItem(KEY_USER_NAME,  name);
        setUserEmail(email); setUserName(name);
      } catch {}

      setIsConnected(true);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const uploadPhoto = useCallback(async (
    photoDataUrl: string,
    storeName: string,
    fileName: string,
    date: string
  ): Promise<OneDriveUploadResult> => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in to OneDrive. Please connect first in Settings.");

    const base64 = photoDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const safeStore  = storeName.replace(/[\s/\\:*?"<>|]/g, "_");
    const remotePath = `/RC_Logger/${date}/${safeStore}/${fileName}`;
    const encoded    = remotePath.split("/").map(encodeURIComponent).join("/");

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:${encoded}:/content`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: bytes }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OneDrive upload failed (${res.status})`);
    }
    const item = await res.json();
    return { itemId: item.id, webUrl: item.webUrl, name: item.name };
  }, [getToken]);

  const deletePhoto = useCallback(async (itemId: string) => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in to OneDrive");
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
  }, [getToken]);

  const getThumbnail = useCallback(async (itemId: string): Promise<string | null> => {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/thumbnails`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      // small (approx 100x100), medium (approx 200x200), large (approx 800x800)
      return data.value?.[0]?.medium?.url || data.value?.[0]?.large?.url || null;
    } catch { return null; }
  }, [getToken]);

  return (
    <Ctx.Provider value={{ isConfigured, isConnected, isConnecting, error, userName, userEmail, clientId, connect, disconnect, uploadPhoto, deletePhoto, getThumbnail, saveClientId }}>
      {children}
    </Ctx.Provider>
  );
}

export const useOneDrive = () => useContext(Ctx);
