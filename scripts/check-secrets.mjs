import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbidden = /(^|\/)(\.env($|\.)|\.dev\.vars($|\.))|\.(pem|key|p12|pfx)$/;
const secret =
  /(?:ntn_[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const violations = files.filter(
  (file) =>
    forbidden.test(file) && !/(?:\.env|\.dev\.vars)\.example$/.test(file),
);
for (const file of files) {
  try {
    if (secret.test(readFileSync(file, "utf8"))) violations.push(file);
  } catch {
    /* Deleted working files are checked by CI after checkout. */
  }
}
if (violations.length) {
  console.error(`Secret scan failed: ${[...new Set(violations)].join(", ")}`);
  process.exitCode = 1;
} else console.log(`Secret scan passed (${files.length} tracked files).`);
