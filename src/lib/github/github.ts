import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "@/lib/env";
import type { GithubAdapter, RemoteRepo } from "./adapter";

/** GitHub App もしくは個人トークンで動く本番アダプタ。 */
export class GithubApi implements GithubAdapter {
  private client(installationId?: string): Octokit {
    const appId = env.optional("GITHUB_APP_ID");
    const privateKey = env.optional("GITHUB_APP_PRIVATE_KEY");
    if (appId && privateKey && installationId) {
      return new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey: privateKey.replace(/\\n/g, "\n"),
          installationId: Number(installationId),
        },
      });
    }
    return new Octokit({ auth: env.optional("GITHUB_TOKEN") });
  }

  async listRepos(source: { login?: string; installationId?: string }): Promise<RemoteRepo[]> {
    const octokit = this.client(source.installationId);
    const repos = source.installationId
      ? await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
      : await octokit.paginate(octokit.rest.repos.listForUser, {
          username: source.login ?? "",
          per_page: 100,
        });
    return (repos as unknown as GithubRepoPayload[]).map(toRemoteRepo);
  }

  async headCommit(fullName: string, branch: string): Promise<string> {
    const [owner, repo] = fullName.split("/");
    const octokit = this.client(env.optional("GITHUB_INSTALLATION_ID"));
    const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch });
    return data.commit.sha;
  }

  async tarball(fullName: string, ref: string): Promise<Buffer> {
    const [owner, repo] = fullName.split("/");
    const octokit = this.client(env.optional("GITHUB_INSTALLATION_ID"));
    const response = await octokit.rest.repos.downloadTarballArchive({ owner, repo, ref });
    return Buffer.from(response.data as ArrayBuffer);
  }
}

interface GithubRepoPayload {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
}

function toRemoteRepo(repo: GithubRepoPayload): RemoteRepo {
  return {
    github_repo_id: String(repo.id),
    full_name: repo.full_name,
    visibility: repo.private ? "private" : "public",
    default_branch: repo.default_branch,
    description: repo.description,
  };
}
