import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function resolveBackupRoot(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const backupRoot = path.resolve(resolvedRoot, ".marvin", "backups");
  if (!backupRoot.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Automated backup directory resolves outside the state root.");
  return backupRoot;
}

export function pruneAutomatedBackups(rootDir, retentionDays = 14, now = new Date()) {
  const backupRoot = resolveBackupRoot(rootDir);
  if (!fs.existsSync(backupRoot)) return 0;
  const cutoff = now.getTime() - Math.max(1, Number(retentionDays || 14)) * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/^automatic-.*\.marvinbackup$/i.test(entry.name)) continue;
    const filePath = path.resolve(backupRoot, entry.name);
    if (!filePath.startsWith(`${backupRoot}${path.sep}`)) continue;
    if (fs.statSync(filePath).mtimeMs < cutoff) {
      fs.rmSync(filePath, { force: true });
      removed += 1;
    }
  }
  return removed;
}

export function runAutomatedBackup({ rootDir, appRoot, now = new Date(), retentionDays = 14 } = {}) {
  if (!String(process.env.MARVIN_BACKUP_PASSPHRASE || "").trim()) return { ok: false, skipped: true, reason: "backup-passphrase-not-configured" };
  const backupRoot = resolveBackupRoot(rootDir);
  fs.mkdirSync(backupRoot, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const output = path.join(backupRoot, `automatic-${timestamp}.marvinbackup`);
  const result = spawnSync(process.execPath, [path.join(appRoot, "scripts", "marvin-state-tool.mjs"), "backup", "--root", path.resolve(rootDir), "--output", output], {
    cwd: appRoot,
    encoding: "utf8",
    windowsHide: true,
    env: process.env
  });
  if (result.status !== 0) throw new Error(`Automated state backup failed: ${String(result.stderr || result.stdout || "unknown error").trim()}`);
  const removed = pruneAutomatedBackups(rootDir, retentionDays, now);
  return { ok: true, skipped: false, output, removedExpiredBackups: removed };
}
