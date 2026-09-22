import type { ScanFinding } from "@/lib/db/types";

/** シークレット検査と置換漏れの照合（仕様書「マスク・ZIP生成パイプライン」4. 検査）。 */

export interface SecretRule {
  id: string;
  regex: RegExp;
  severity: "high" | "medium";
}

/** gitleaks 相当のルール。値そのものは記録せずマスクして残す。 */
export const SECRET_RULES: SecretRule[] = [
  { id: "private-key", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: "high" },
  { id: "aws-access-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "high" },
  { id: "github-token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, severity: "high" },
  { id: "openai-key", regex: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g, severity: "high" },
  { id: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, severity: "high" },
  { id: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: "high" },
  { id: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high" },
  { id: "stripe-key", regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g, severity: "high" },
  { id: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: "medium" },
  { id: "connection-string", regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/g, severity: "high" },
  {
    id: "generic-secret",
    regex: /\b(?:api[_-]?key|secret|token|password|passwd|credential)\b["'\s]*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi,
    severity: "medium",
  },
];

/** 値の中身が読めないよう、前後だけ残してマスクする。 */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.min(trimmed.length - 8, 24))}${trimmed.slice(-4)}`;
}

/** `.env.example` など、空値のプレースホルダは検出しない。 */
function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return /^(?:your|xxx+|<|\$\{|placeholder|changeme|example|dummy|sample|test|todo|\.\.\.)/.test(normalized);
}

export function scanSecrets(filePath: string, text: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const rule of SECRET_RULES) {
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.regex.exec(line)) !== null) {
        const value = match[1] ?? match[0];
        if (isPlaceholder(value)) continue;
        findings.push({
          rule: rule.id,
          path: filePath,
          line: index + 1,
          excerpt: line.trim().slice(0, 200).replace(value, maskSecret(value)),
          severity: rule.severity,
        });
      }
    }
  });
  return findings;
}

/** 置換漏れの確認。NGワードが残っていないかを見る（置換はしない）。 */
export function scanNgWords(filePath: string, text: string, ngWords: string[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = text.split("\n");
  for (const word of ngWords) {
    if (!word) continue;
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    lines.forEach((line, index) => {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        findings.push({
          rule: `ngword:${word}`,
          path: filePath,
          line: index + 1,
          excerpt: line.trim().slice(0, 200),
          severity: "medium",
        });
      }
    });
  }
  return findings;
}

/**
 * NGワードの初期値。`claude` などはコードの正当な用途でも出てくるため、
 * 置換はせず検出して運営が確認する。
 */
export const DEFAULT_NG_WORDS = ["claude", "anthropic", "cursor", "copilot", "noreply"];

/** 1件でも high があれば公開を止める。medium は運営の確認待ちにする。 */
export function shouldBlockPublish(findings: ScanFinding[]): boolean {
  return findings.length > 0;
}
