import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "X-Auth-Token"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length", "Content-Disposition"],
  maxAge: 600,
}));

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUCKET_NAME = "make-4f0446c0-rc-photos";

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === BUCKET_NAME)) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,           // public → getPublicUrl works without expiry
        fileSizeLimit: 20 * 1024 * 1024,
      });
      if (error) console.log("Bucket creation error:", error);
      else console.log("Created public storage bucket:", BUCKET_NAME);
    } else {
      // Ensure existing bucket is public so images load in browser
      await supabase.storage.updateBucket(BUCKET_NAME, { public: true }).catch(() => {});
    }
    const adminExists = await kv.get("username_index:admin");
    if (!adminExists) {
      const adminId = crypto.randomUUID();
      const passwordHash = await hashPassword("Admin@123");
      await kv.set(`user:${adminId}`, {
        id: adminId, username: "admin", displayName: "Administrator",
        passwordHash, role: "admin", createdAt: new Date().toISOString(),
      });
      await kv.set("username_index:admin", adminId);
      console.log("Created default admin: admin / Admin@123");
    }
  } catch (e) {
    console.log("Init error:", e);
  }
}

init();

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password + "rc_blinkit_salt_2025_v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySession(token: string | null): Promise<Record<string, string> | null> {
  if (!token) return null;
  try {
    const session = await kv.get(`session:${token}`);
    if (!session) return null;
    const s = session as Record<string, string>;
    if (new Date(s.expires) < new Date()) { await kv.del(`session:${token}`); return null; }
    return s;
  } catch { return null; }
}

async function requireAuth(c: any) {
  return verifySession(c.req.header("X-Auth-Token") || null);
}

// Helper: get public URL for a stored file (permanent, no expiry)
function getPublicUrl(filePath: string): string {
  const res = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  // Handle both { data: { publicUrl } } and { publicUrl } structures
  return res.data?.publicUrl || (res as any).publicUrl || "";
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get("/make-server-4f0446c0/health", (c) => c.json({ status: "ok" }));

// ─── AUTH: LOGIN ─────────────────────────────────────────────────────────────
app.post("/make-server-4f0446c0/auth/login", async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) return c.json({ error: "Username and password required" }, 400);

    const userId = await kv.get(`username_index:${username.toLowerCase().trim()}`);
    if (!userId) return c.json({ error: "Invalid username or password" }, 401);

    const user = await kv.get(`user:${userId}`) as any;
    if (!user) return c.json({ error: "User not found" }, 401);

    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) return c.json({ error: "Invalid username or password" }, 401);

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await kv.set(`session:${token}`, {
      token, userId: user.id, username: user.username,
      displayName: user.displayName || user.username, role: user.role, expires,
    });

    return c.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role } });
  } catch (e) {
    console.log("Login error:", e);
    return c.json({ error: `Login failed: ${e}` }, 500);
  }
});

// ─── USERS: CREATE ───────────────────────────────────────────────────────────
app.post("/make-server-4f0446c0/users", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const { username, displayName, password, role } = await c.req.json();
    if (!username || !password) return c.json({ error: "Username and password required" }, 400);

    const lUsername = username.toLowerCase().trim();
    const existing = await kv.get(`username_index:${lUsername}`);
    if (existing) return c.json({ error: "Username already exists" }, 400);

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const user = { id, username: lUsername, displayName: displayName || username, passwordHash, role: role || "user", createdAt: new Date().toISOString() };
    await kv.set(`user:${id}`, user);
    await kv.set(`username_index:${lUsername}`, id);

    return c.json({ id, username: lUsername, displayName: user.displayName, role: user.role, createdAt: user.createdAt });
  } catch (e) {
    console.log("Create user error:", e);
    return c.json({ error: `Failed to create user: ${e}` }, 500);
  }
});

// ─── USERS: LIST ─────────────────────────────────────────────────────────────
app.get("/make-server-4f0446c0/users", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const users = await kv.getByPrefix("user:") as any[];
    const list = users
      .filter(u => u && u.id && u.username && u.role)
      .map(u => ({ id: u.id, username: u.username, displayName: u.displayName || u.username, role: u.role, createdAt: u.createdAt }));

    return c.json(list);
  } catch (e) {
    return c.json({ error: `Failed to list users: ${e}` }, 500);
  }
});

// ─── USERS: DELETE ───────────────────────────────────────────────────────────
app.delete("/make-server-4f0446c0/users/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const userId = c.req.param("id");
    const user = await kv.get(`user:${userId}`) as any;
    if (!user) return c.json({ error: "User not found" }, 404);
    if (user.username === "admin") return c.json({ error: "Cannot delete admin user" }, 400);

    await kv.del(`user:${userId}`);
    await kv.del(`username_index:${user.username}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: `Failed to delete user: ${e}` }, 500);
  }
});

// ─── USERS: UPDATE ───────────────────────────────────────────────────────────
app.put("/make-server-4f0446c0/users/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const userId = c.req.param("id");
    const { displayName, role, newPassword } = await c.req.json();

    const user = await kv.get(`user:${userId}`) as any;
    if (!user) return c.json({ error: "User not found" }, 404);

    const updated = { ...user };
    if (displayName !== undefined) updated.displayName = displayName;
    if (role !== undefined && user.username !== "admin") updated.role = role;
    if (newPassword) updated.passwordHash = await hashPassword(newPassword);

    await kv.set(`user:${userId}`, updated);
    return c.json({ id: updated.id, username: updated.username, displayName: updated.displayName, role: updated.role });
  } catch (e) {
    return c.json({ error: `Failed to update user: ${e}` }, 500);
  }
});

// ─── PHOTOS: UPLOAD ──────────────────────────────────────────────────────────
app.post("/make-server-4f0446c0/photos/upload", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Authentication required" }, 401);

    const body = await c.req.json();
    const {
      storeName, cratePrefix, crateType, crateSuffix,
      photoType, timestamp, fileName,
      photoData,
      oneDriveItemId, oneDriveWebUrl,
      storageType = "supabase",
    } = body;

    if (!storeName || !cratePrefix || !crateSuffix) return c.json({ error: "Missing required fields" }, 400);

    const fullCrateName = `${cratePrefix}_${crateType || "PERM"}_${crateSuffix}`;
    const ts = new Date(timestamp || Date.now());
    const date = ts.toISOString().split("T")[0];
    const timeStr = ts.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const resolvedFileName = fileName || `${fullCrateName}_${timeStr}.jpg`;

    let filePath: string | null = null;

    if (storageType === "supabase") {
      if (!photoData) return c.json({ error: "Photo data required for server storage" }, 400);

      const base64 = photoData.replace(/^data:image\/\w+;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const storeFolder = storeName.replace(/\s+/g, "_");
      filePath = `${storeFolder}/${date}/${resolvedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, bytes, { contentType: "image/jpeg", upsert: true });

      if (uploadError) {
        console.log("Storage upload error:", uploadError);
        return c.json({ error: `Storage upload failed: ${uploadError.message}` }, 500);
      }
    }

    const photoId = crypto.randomUUID();
    const meta = {
      id: photoId,
      userId: session.userId, username: session.username, displayName: session.displayName,
      storeName, cratePrefix, crateType: crateType || "PERM", crateSuffix, fullCrateName,
      photoType: photoType || "capture", timestamp: ts.toISOString(), date,
      filePath, fileName: resolvedFileName, storageType,
      oneDriveItemId: oneDriveItemId || null, oneDriveWebUrl: oneDriveWebUrl || null,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`photo:${photoId}`, meta);

    return c.json({ success: true, photoId, filePath });
  } catch (e) {
    console.log("Photo upload error:", e);
    return c.json({ error: `Upload failed: ${e}` }, 500);
  }
});

// ─── PHOTOS: LIST ────────────────────────────────────────────────────────────
app.get("/make-server-4f0446c0/photos", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Authentication required" }, 401);

    const { storeName, date, crateId } = c.req.query();

    const allPhotos = await kv.getByPrefix("photo:") as any[];
    let photos = allPhotos.filter(p => p && p.id && p.fullCrateName);

    // If not admin, restricted to own photos
    if (session.role !== "admin") {
      photos = photos.filter(p => p.userId === session.userId);
    }

    if (storeName) photos = photos.filter(p => p.storeName === storeName);
    if (date) photos = photos.filter(p => p.date === date);
    if (crateId) photos = photos.filter(p => p.fullCrateName?.toLowerCase().includes(crateId.toLowerCase()));

    photos.sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tB - tA;
    });

    // Build URLs — use permanent public URLs for Supabase (no expiry)
    const withUrls = photos.map(p => {
      if (p.storageType === "onedrive" && p.oneDriveWebUrl) {
        return { ...p, viewUrl: p.oneDriveWebUrl };
      }
      if (p.filePath) {
        const url = getPublicUrl(p.filePath);
        return { ...p, viewUrl: url };
      }
      return { ...p, viewUrl: null };
    });

    return c.json(withUrls);
  } catch (e) {
    console.log("List photos error:", e);
    return c.json({ error: `Failed to list photos: ${e}` }, 500);
  }
});

// ─── PHOTOS: STATS ───────────────────────────────────────────────────────────
app.get("/make-server-4f0446c0/stats", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const allPhotos = await kv.getByPrefix("photo:") as any[];
    const photos = allPhotos.filter(p => p && p.id && p.fullCrateName);

    const storeCount: Record<string, number> = {};
    const dateCount: Record<string, number> = {};

    for (const p of photos) {
      storeCount[p.storeName] = (storeCount[p.storeName] || 0) + 1;
      dateCount[p.date] = (dateCount[p.date] || 0) + 1;
    }

    const today = new Date().toISOString().split("T")[0];
    return c.json({ total: photos.length, todayCount: dateCount[today] || 0, storeCount, dateCount });
  } catch (e) {
    return c.json({ error: `Failed to get stats: ${e}` }, 500);
  }
});

// ─── PHOTOS: DOWNLOAD ZIP ────────────────────────────────────────────────────
app.get("/make-server-4f0446c0/photos/download-zip", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const { storeName, date } = c.req.query();

    const allPhotos = await kv.getByPrefix("photo:") as any[];
    let photos = allPhotos.filter(p => p && p.id && p.fullCrateName && p.filePath && p.storageType !== "onedrive");

    if (storeName) photos = photos.filter(p => p.storeName === storeName);
    if (date) photos = photos.filter(p => p.date === date);

    if (photos.length === 0) return c.json({ error: "No server-stored photos found for the selected filters" }, 404);

    // @ts-ignore
    const JSZip = (await import("npm:jszip")).default;
    const zip = new JSZip();

    for (const photo of photos) {
      try {
        const { data, error } = await supabase.storage.from(BUCKET_NAME).download(photo.filePath);
        if (error || !data) { console.log("Skip:", photo.filePath, error); continue; }
        const ab = await data.arrayBuffer();
        const storeFolder = (photo.storeName || "Unknown").replace(/\s+/g, "_");
        zip.folder(storeFolder)?.folder(photo.date || "Unknown")?.file(photo.fileName || `${photo.id}.jpg`, new Uint8Array(ab));
      } catch (err) {
        console.log("Zip file error:", photo.id, err);
      }
    }

    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const safeStore = (storeName || "All_Stores").replace(/\s+/g, "_");
    const fname = `RC_${safeStore}_${date || "All_Dates"}.zip`;

    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
      },
    });
  } catch (e) {
    console.log("ZIP error:", e);
    return c.json({ error: `Failed to create ZIP: ${e}` }, 500);
  }
});

// ─── PHOTOS: CLEANUP PREVIEW ─────────────────────────────────────────────────
app.get("/make-server-4f0446c0/photos/cleanup-preview", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const days = parseInt(c.req.query("olderThanDays") || "90");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffDate = cutoff.toISOString().split("T")[0];

    const all = await kv.getByPrefix("photo:") as any[];
    const old = all.filter(p => p && p.id && p.date && p.date < cutoffDate);

    return c.json({
      count: old.length, cutoffDate,
      supabaseCount: old.filter(p => p.storageType !== "onedrive" && p.filePath).length,
      oneDriveCount: old.filter(p => p.storageType === "onedrive").length,
    });
  } catch (e) {
    return c.json({ error: `Preview failed: ${e}` }, 500);
  }
});

// ─── PHOTOS: CLEANUP DELETE ───────────────────────────────────────────────────
app.delete("/make-server-4f0446c0/photos/cleanup", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session || session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const days = parseInt(c.req.query("olderThanDays") || "90");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffDate = cutoff.toISOString().split("T")[0];

    const all = await kv.getByPrefix("photo:") as any[];
    const old = all.filter(p => p && p.id && p.date && p.date < cutoffDate);

    let deleted = 0, storageDeleted = 0, errors = 0;
    for (const photo of old) {
      try {
        if (photo.filePath && photo.storageType !== "onedrive") {
          const { error } = await supabase.storage.from(BUCKET_NAME).remove([photo.filePath]);
          if (!error) storageDeleted++;
        }
        await kv.del(`photo:${photo.id}`);
        deleted++;
      } catch { errors++; }
    }

    return c.json({ deleted, storageDeleted, errors, cutoffDate });
  } catch (e) {
    console.log("Cleanup error:", e);
    return c.json({ error: `Cleanup failed: ${e}` }, 500);
  }
});

Deno.serve(app.fetch);
