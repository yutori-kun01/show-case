import { getConfig } from "@/lib/config";
import type { GithubAdapter } from "./adapter";
import { LocalGithub } from "./local";

let override: GithubAdapter | null = null;

/**
 * セットアップ画面（なければ環境変数）の GitHub トークンか GitHub App があれば本番アダプタを使う。
 * 本番アダプタは Octokit を読み込むため、必要になってから取り込む。
 */
export async function github(): Promise<GithubAdapter> {
  if (override) return override;
  const config = await getConfig();
  if (config.githubDriver === "github") {
    const { GithubApi } = await import("./github");
    return new GithubApi(config.githubToken);
  }
  return new LocalGithub();
}

export function setGithub(adapter: GithubAdapter | null): void {
  override = adapter;
}

export type { GithubAdapter, RemoteRepo } from "./adapter";
