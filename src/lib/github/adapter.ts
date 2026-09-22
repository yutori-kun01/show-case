export interface RemoteRepo {
  github_repo_id: string;
  full_name: string;
  visibility: "public" | "private";
  default_branch: string;
  description: string | null;
}

/**
 * GitHub連携。運営側とZIP生成ジョブからのみ使う。
 * 権限は Contents: 読み取り と Metadata: 読み取り だけを想定する。
 */
export interface GithubAdapter {
  /** パブリックはユーザー名、プライベートはGitHub Appのインストールから取得する。 */
  listRepos(source: { login?: string; installationId?: string }): Promise<RemoteRepo[]>;
  /** ブランチの先頭コミットのSHA。 */
  headCommit(fullName: string, branch: string): Promise<string>;
  /** 特定コミットの tarball（.git を含まないため履歴とCo-Authored-Byはこの時点で消える）。 */
  tarball(fullName: string, ref: string): Promise<Buffer>;
}
