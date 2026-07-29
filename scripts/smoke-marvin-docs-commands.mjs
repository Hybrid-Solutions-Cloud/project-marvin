import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const docsRoot = path.join(root, "docs");
const markdownFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".md")) {
      markdownFiles.push(fullPath);
    }
  }
}

walk(docsRoot);

const missing = [];
const npmRefs = [];
const nodeRefs = [];
const pwshRefs = [];

for (const filePath of markdownFiles) {
  const text = fs.readFileSync(filePath, "utf8");
  const relativeFile = path.relative(root, filePath).replaceAll("\\", "/");

  for (const match of text.matchAll(/npm run (marvin:[A-Za-z0-9:-]+)/g)) {
    const scriptName = match[1];
    npmRefs.push({ file: relativeFile, ref: scriptName });
    if (!pkg.scripts[scriptName]) {
      missing.push({ type: "npm", file: relativeFile, ref: scriptName });
    }
  }

  for (const match of text.matchAll(/node (scripts\/[A-Za-z0-9._-]+)/g)) {
    const scriptRef = match[1];
    nodeRefs.push({ file: relativeFile, ref: scriptRef });
    const target = path.join(root, scriptRef.replaceAll("/", path.sep));
    if (!fs.existsSync(target)) {
      missing.push({ type: "node", file: relativeFile, ref: scriptRef });
    }
  }

  for (const match of text.matchAll(/pwsh -ExecutionPolicy Bypass -File \.\\(scripts\\[A-Za-z0-9._-]+)/g)) {
    const scriptRef = match[1].replaceAll("\\", "/");
    pwshRefs.push({ file: relativeFile, ref: scriptRef });
    const target = path.join(root, match[1]);
    if (!fs.existsSync(target)) {
      missing.push({ type: "pwsh", file: relativeFile, ref: scriptRef });
    }
  }
}

assert.equal(missing.length, 0, `Documented commands point at missing repo targets: ${JSON.stringify(missing)}`);

console.log(JSON.stringify({
  ok: true,
  docsScanned: markdownFiles.length,
  npmCommandRefs: npmRefs.length,
  nodeScriptRefs: nodeRefs.length,
  pwshScriptRefs: pwshRefs.length,
  checked: [
    "Documented npm run marvin:* commands exist in package.json",
    "Documented node scripts/* paths exist in the repo",
    "Documented pwsh -File .\\scripts\\* paths exist in the repo"
  ]
}, null, 2));
