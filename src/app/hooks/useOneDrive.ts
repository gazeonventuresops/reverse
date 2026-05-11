/**
 * OneDrive integration via Microsoft OAuth2 Authorization Code + PKCE flow.
 * No MSAL dependency — uses native fetch + postMessage popup pattern.
 * Popup redirects back to this origin, App.tsx intercepts it, posts the code
 * back to the parent window, and this hook exchanges the code for tokens.
 */
import { useState, useEffect, useCallback } from "react";

const OD_CLIENT_ID_KEY  = "od_client_id";
const OD_ACCESS_TOKEN   = "od_access_token";
const OD_REFRESH_TOKEN  = "od_refresh_token";
const OD_TOKEN_EXPIRY   = "od_token_expiry";   // epoch ms as string
const OD_USER_NAME      = "od_user_name";
const OD_USER_EMAIL     = "od_user_email";
const PKCE_VERIFIER_KEY = "od_pkce_verifier";

const GRAPH_SCOPES = "Files.ReadWrite.All User.Read offline_access";
const TOKEN_URL    = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const AUTH_URL     = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

// ── PKCE helpers ─────────────────────────────────────────────────────────────
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return { verifier, challenge };
}

// ── Token exchange ────────────────────────────────────────────────────────────
async function exchangeCode(code: string, clientId: string, verifier: string) {
  const body = new URLSearchParams({
    client_id:     clientId,
    code,
    redirect_uri:  window.location.origin,
    grant_type:    "authorization_code",
    code_verifier: verifier,
    scope:         GRAPH_SCOPES,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || "Token exchange failed");
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshTokens(refreshToken: string, clientId: string) {
  const body = new URLSearchParams({
    client_id:     clientId,
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
    scope:         GRAPH_SCOPES,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

function saveTokens(tokens: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(OD_ACCESS_TOKEN, tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem(OD_REFRESH_TOKEN, tokens.refresh_token);
  localStorage.setItem(OD_TOKEN_EXPIRY, String(Date.now() + tokens.expires_in * 1000));
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export interface OneDriveUploadResult {
  itemId: string;
  webUrl: string;
  name: string;
}

export function useOneDrive() {
  const [isConnected, setIsConnected]   = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError]               = useState("");
  const [userEmail, setUserEmail]       = useState("");
  const [userName, setUserName]         = useState("");

  const clientId = localStorage.getItem(OD_CLIENT_ID_KEY) || "";
  const isConfigured = !!clientId;

  // Check stored token on mount
  useEffect(() => {
    const token   = localStorage.getItem(OD_ACCESS_TOKEN);
    const expiry  = parseInt(localStorage.getItem(OD_TOKEN_EXPIRY) || "0");
    const refresh = localStorage.getItem(OD_REFRESH_TOKEN);
    if (token && (expiry > Date.now() || refresh)) {
      setIsConnected(true);
      setUserEmail(localStorage.getItem(OD_USER_EMAIL) || "");
      setUserName(localStorage.getItem(OD_USER_NAME)  || "");
    }
  }, []);

  // Get a valid access token (auto-refresh if expired)
  const getToken = useCallback(async (): Promise<string | null> => {
    const cid     = localStorage.getItem(OD_CLIENT_ID_KEY) || "";
    const token   = localStorage.getItem(OD_ACCESS_TOKEN);
    const expiry  = parseInt(localStorage.getItem(OD_TOKEN_EXPIRY) || "0");
    const refresh = localStorage.getItem(OD_REFRESH_TOKEN);

    if (!token || !cid) return null;

    // Token still valid (5-min buffer)
    if (expiry > Date.now() + 5 * 60 * 1000) return token;

    // Refresh
    if (!refresh) { disconnect(); return null; }
    try {
      const tokens = await refreshTokens(refresh, cid);
      saveTokens(tokens);
      return tokens.access_token;
    } catch {
      disconnect();
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(OD_ACCESS_TOKEN);
    localStorage.removeItem(OD_REFRESH_TOKEN);
    localStorage.removeItem(OD_TOKEN_EXPIRY);
    localStorage.removeItem(OD_USER_EMAIL);
    localStorage.removeItem(OD_USER_NAME);
    setIsConnected(false);
    setUserEmail("");
    setUserName("");
  }, []);

  // ── OAuth popup connect ────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const cid = localStorage.getItem(OD_CLIENT_ID_KEY) || "";
    if (!cid) {
      setError("OneDrive Client ID not configured. Go to Admin → Settings first.");
      return;
    }

    setIsConnecting(true);
    setError("");

    try {
      const { verifier, challenge } = await generatePKCE();
      sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

      const params = new URLSearchParams({
        client_id:             cid,
        response_type:         "code",
        redirect_uri:          window.location.origin,
        scope:                 GRAPH_SCOPES,
        code_challenge:        challenge,
        code_challenge_method: "S256",
        response_mode:         "query",
        prompt:                "select_account",
      });

      const authUrl = `${AUTH_URL}?${params}`;
      const popup = window.open(authUrl, "od_auth", "width=520,height=680,popup=yes,noopener=no");
      if (!popup) throw new Error("Popup was blocked. Please allow popups for this site.");

      const code = await new Promise<string>((resolve, reject) => {
        let done = false;

        // Listen for postMessage from the popup (sent by App.tsx on callback)
        const messageHandler = (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin) return;
          if (ev.data?.type !== "od_auth_callback") return;
          done = true;
          window.removeEventListener("message", messageHandler);
          clearInterval(closedCheck);
          if (ev.data.error) {
            reject(new Error(ev.data.errorDesc || ev.data.error));
          } else if (ev.data.code) {
            resolve(ev.data.code);
          } else {
            reject(new Error("No authorization code received"));
          }
        };
        window.addEventListener("message", messageHandler);

        // Fallback: detect popup closed without auth
        const closedCheck = setInterval(() => {
          if (popup?.closed && !done) {
            done = true;
            clearInterval(closedCheck);
            window.removeEventListener("message", messageHandler);
            reject(new Error("Sign-in window was closed before completing."));
          }
        }, 800);

        // Timeout after 8 minutes
        setTimeout(() => {
          if (!done) {
            done = true;
            clearInterval(closedCheck);
            window.removeEventListener("message", messageHandler);
            popup?.close();
            reject(new Error("Sign-in timed out. Please try again."));
          }
        }, 8 * 60 * 1000);
      });

      // Exchange code for tokens
      const pkceVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY) || "";
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      const tokens = await exchangeCode(code, cid, pkceVerifier);
      saveTokens(tokens);

      // Fetch user profile
      try {
        const me = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }).then(r => r.json());
        const email = me.mail || me.userPrincipalName || "";
        const name  = me.displayName || email;
        localStorage.setItem(OD_USER_EMAIL, email);
        localStorage.setItem(OD_USER_NAME, name);
        setUserEmail(email);
        setUserName(name);
      } catch {}

      setIsConnected(true);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── Upload file to OneDrive ────────────────────────────────────────────────
  const uploadPhoto = useCallback(async (
    photoDataUrl: string,
    storeName: string,
    fileName: string,
    date: string
  ): Promise<OneDriveUploadResult> => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in to OneDrive. Please reconnect.");

    // Convert base64 to Uint8Array
    const base64 = photoDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const safeStore   = storeName.replace(/[\s/\\:*?"<>|]/g, "_");
    const remotePath  = `/RC_Logger/${safeStore}/${date}/${fileName}`;
    const encodedPath = remotePath.split("/").map(encodeURIComponent).join("/");

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:${encodedPath}:/content`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
        body: bytes,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OneDrive upload failed (HTTP ${res.status})`);
    }

    const item = await res.json();
    return { itemId: item.id, webUrl: item.webUrl, name: item.name };
  }, [getToken]);

  // ── Delete a file from OneDrive ───────────────────────────────────────────
  const deletePhoto = useCallback(async (itemId: string): Promise<void> => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in to OneDrive");
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`OneDrive delete failed (${res.status})`);
  }, [getToken]);

  return {
    isConfigured,
    isConnected,
    isConnecting,
    error,
    userEmail,
    userName,
    connect,
    disconnect,
    uploadPhoto,
    deletePhoto,
    getToken,
  };
}
