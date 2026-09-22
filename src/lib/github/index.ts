import { env } from "@/lib/env";
import type { GithubAdapter } from "./adapter";
import { LocalGithub } from "./local";

let cached: GithubAdapter | null = null;

/** 本番アダプタは Octokit を読み込むため、必要になってから取り込む。 */
export async function github(): Promise<GithubAdapter> {
  if (!cached) {
    if (env.githubDriver === "github") {
      const { GithubApi } = await import("./github");
      cached = new GithubApi();
    } else {
      cached = new LocalGithub();
    }
  }
  return cached;
}

export function setGithub(adapter: GithubAdapter | null): void {
  cached = adapter;
}

export type { GithubAdapter, RemoteRepo } from "./adapter";
