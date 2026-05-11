import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { OneDriveProvider } from "./context/OneDriveContext";

// ── OAuth popup callback handler ───────────────────────────────────────────
// When Microsoft redirects the popup back here with ?code=…, we detect it,
// post the code to the parent window, and close the popup.
const _p = new URLSearchParams(window.location.search);
const _code  = _p.get("code");
const _odErr = _p.get("error");

if ((_code || _odErr) && window.opener) {
  try {
    window.opener.postMessage(
      { type: "od_auth_callback", code: _code, error: _odErr, errorDesc: _p.get("error_description") },
      window.location.origin
    );
  } catch {}
  window.close();
}

export default function App() {
  if ((_code || _odErr) && window.opener) return null; // popup callback — nothing to render

  return (
    <AuthProvider>
      <OneDriveProvider>
        <RouterProvider router={router} />
      </OneDriveProvider>
    </AuthProvider>
  );
}
