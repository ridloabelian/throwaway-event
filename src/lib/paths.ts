import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Returns the resolved SQLite database file path.
 * Defaults to `<cwd>/data/throwaway.db` for zero-config local execution.
 */
export function getDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  return path.resolve(
    /*turbopackIgnore: true*/ configured || path.join(process.cwd(), "data", "throwaway.db"),
  );
}

/**
 * Returns the resolved local photo storage directory.
 * Defaults to `<cwd>/data/uploads`.
 */
export function getStorageDir(): string {
  const configured = process.env.STORAGE_DIR?.trim();
  return path.resolve(
    /*turbopackIgnore: true*/ configured || path.join(process.cwd(), "data", "uploads"),
  );
}

/**
 * Returns the HMAC session signing secret.
 * Uses `SESSION_SECRET` env var if provided; otherwise reads or atomically
 * generates a persistent local secret alongside the SQLite database file.
 */
export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  const secretFile = path.join(path.dirname(getDatabasePath()), ".session-secret");
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });

  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 32) {
      return existing;
    }
  } catch {
    // Secret file does not exist yet; create it below.
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretFile, generated, { flag: "wx", mode: 0o600 });
    return generated;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      const existing = fs.readFileSync(secretFile, "utf8").trim();
      if (existing.length >= 16) {
        return existing;
      }
    }
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  }
}

/**
 * Resolves a photo storage key safely inside `getStorageDir()`, blocking path traversal.
 */
export function resolveSafePhotoPath(storageKey: string): string {
  if (!storageKey || storageKey.trim() === "" || storageKey === "." || storageKey === "..") {
    throw new Error("Invalid photo storage key");
  }

  const storageDir = getStorageDir();
  const resolved = path.resolve(storageDir, storageKey);
  const prefix = storageDir.endsWith(path.sep) ? storageDir : `${storageDir}${path.sep}`;

  if (!resolved.startsWith(prefix)) {
    throw new Error("Photo storage path escapes storage root");
  }

  return resolved;
}
