import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const sourceRoot = path.resolve(repoRoot, "operator-ui", "public");
const outputRoot = path.resolve(repoRoot, "operator-ui", "dist");

function listFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? listFiles(root, path.join(current, entry.name))
      : [path.relative(root, path.join(current, entry.name)).replaceAll("\\", "/")])
    .sort((left, right) => left.localeCompare(right));
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

if (!fs.existsSync(path.join(sourceRoot, "index.html"))) {
  throw new Error("Portal source is missing operator-ui/public/index.html.");
}

const sourceFiles = listFiles(sourceRoot);
for (const relativePath of sourceFiles.filter((file) => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", path.join(sourceRoot, relativePath)], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || `JavaScript validation failed: ${relativePath}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
for (const relativePath of sourceFiles) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const outputPath = path.join(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(sourcePath, outputPath);
}

const manifest = {
  schemaVersion: 1,
  product: "project-marvin",
  entrypoint: "index.html",
  files: sourceFiles.map((relativePath) => {
    const contents = fs.readFileSync(path.join(outputRoot, relativePath));
    return { path: relativePath, bytes: contents.length, sha256: hash(contents) };
  })
};
fs.writeFileSync(path.join(outputRoot, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  outputRoot,
  files: manifest.files.length,
  manifestSha256: hash(Buffer.from(JSON.stringify(manifest)))
}, null, 2));
