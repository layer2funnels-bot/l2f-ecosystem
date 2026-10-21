// Fails when a tracked source file is corrupted (binary garbage, invalid UTF-8, NUL bytes) or uses CRLF line endings.
// This is what broke Vercel builds when files were re-uploaded with a bad encoding.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => /\.(ts|tsx|js|mjs|css|json|md|yml|yaml|sql|toml)$/.test(f) && f !== "package-lock.json");

const problems = [];
for (const file of files) {
  const buf = readFileSync(file);
  if (buf.includes(0)) problems.push(`${file}: contains NUL bytes (binary or wrong encoding)`);
  else {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      problems.push(`${file}: not valid UTF-8`);
      continue;
    }
    if (buf.includes(13)) problems.push(`${file}: CRLF line endings (use LF)`);
  }
}

if (problems.length) {
  console.error(`File integrity check failed:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`File integrity check passed (${files.length} files).`);
