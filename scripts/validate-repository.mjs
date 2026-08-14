#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillName = "douyin-live-flash-sale-editor";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.name === ".git") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
}

const skillFile = path.join(root, "SKILL.md");
assert(fs.existsSync(skillFile), "SKILL.md missing");
const skillText = fs.readFileSync(skillFile, "utf8");
const match = skillText.match(/^---\n([\s\S]*?)\n---\n/);
assert(match, "YAML frontmatter missing");
const keys = [...match[1].matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((row) => row[1]);
assert.deepEqual(keys.sort(), ["description", "name"], "frontmatter must contain only name and description");
assert(new RegExp(`^name: ${skillName}$`, "m").test(match[1]), "frontmatter name mismatch");
assert(/^description: .+$/m.test(match[1]), "description missing");
assert(fs.existsSync(path.join(root, "agents", "openai.yaml")), "agents/openai.yaml missing");

const textExtensions = new Set([".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".sh", ".txt"]);
const forbidden = [
  { label: "personal absolute path", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "embedded bearer credential", pattern: /authorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+\/-]{16,}/i },
];

for (const file of walk(root)) {
  const relative = path.relative(root, file);
  assert(!/\.bak$|\.har$|\.env$/.test(file), `${relative}: forbidden artifact type`);
  if (!textExtensions.has(path.extname(file))) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const check of forbidden) assert(!check.pattern.test(text), `${relative}: ${check.label} detected`);
}

for (const file of walk(root)) {
  if (file.endsWith(".mjs") || file.endsWith(".js")) run(process.execPath, ["--check", file]);
  if (file.endsWith(".sh")) run("bash", ["-n", file]);
}

run(process.execPath, ["scripts/test-runner.mjs"]);
console.log(JSON.stringify({ ok: true, skill: skillName, checks: ["structure", "secret-patterns", "syntax", "self-test"] }));
