import { env } from "@/lib/env";

/**
 * 運営側のURLを組み立てる。秘匿ホストで運用する場合は接頭辞なし、
 * 秘匿パスで運用する場合は OPS_BASE_PATH を前に付ける。
 */
export function opsUrl(path = "/"): string {
  const suffix = path === "/" ? "" : path;
  if (env.opsHost) return suffix || "/";
  return `${env.opsBasePath}${suffix}`;
}
