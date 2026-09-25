import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { DownloadForm } from "@/components/DownloadForm";
import { ReportForm } from "@/components/ReportForm";
import { getPublishedListing, toPublicListing } from "@/lib/services/publicView";
import { publishedSnapshot } from "@/lib/services/snapshots";
import { currentViewerAccess, requireViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // 閲覧制限中は、ログイン前にタイトルや概要を漏らさない。
  if (!(await currentViewerAccess()).allowed) return { title: "ログイン" };
  const listing = await getPublishedListing(slug);
  if (!listing) return { title: "見つかりません" };
  return { title: listing.title, description: listing.summary };
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const access = await requireViewer(`/r/${slug}`);
  const listing = await getPublishedListing(slug);
  if (!listing) notFound();

  const view = toPublicListing(listing);
  const snapshot = await publishedSnapshot(listing);

  return (
    <>
      <SiteHeader viewerEmail={access.viewer?.email} />
      <main className="container">
        <h1>{view.title}</h1>
        <p className="lead">{view.summary}</p>
        <div className="tags">
          {view.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>

        {view.hero_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="media" src={view.hero_image} alt="" />
        )}

        {view.demo_media.length > 0 && (
          <section>
            <h2>デモ</h2>
            {view.demo_media.map((media) =>
              media.kind === "video" ? (
                <video key={media.url} className="media" src={media.url} controls playsInline muted loop />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={media.url} className="media" src={media.url} alt={media.caption ?? ""} />
              ),
            )}
          </section>
        )}

        {view.description && (
          <section>
            <h2>機能</h2>
            <div className="panel" style={{ whiteSpace: "pre-wrap" }}>
              {view.description}
            </div>
          </section>
        )}

        <section>
          <h2>必要な環境</h2>
          <div className="panel tight">
            {view.requirements.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {view.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <span className="muted">特にありません。</span>
            )}
          </div>
        </section>

        <section>
          <h2>セットアップの流れ</h2>
          <ol className="steps">
            <li>ZIPをダウンロードして展開します</li>
            <li>
              <code>.env.example</code> をコピーして <code>.env</code> を作り、キーを入力します
              {view.env_keys.length > 0 && (
                <table style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>キー</th>
                      <th>必須</th>
                      <th>説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.env_keys.map((item) => (
                      <tr key={item.key}>
                        <td>
                          <code>{item.key}</code>
                        </td>
                        <td>{item.required ? "必須" : "任意"}</td>
                        <td>
                          {item.description}
                          {item.how_to_get && (
                            <>
                              {" "}
                              <a href={item.how_to_get} target="_blank" rel="noreferrer noopener">
                                取得先
                              </a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
            {view.setup && (
              <li>
                インストール: <code>{view.setup}</code>（<code>setup.sh</code> / <code>setup.ps1</code> でも実行できます）
              </li>
            )}
            {view.start && (
              <li>
                起動: <code>{view.start}</code>
                {view.open_url && (
                  <>
                    {" "}
                    → <code>{view.open_url}</code> を開きます
                  </>
                )}
              </li>
            )}
            <li>
              うまくいかないときは、同梱の <code>AI_SETUP_PROMPT.md</code> をAIエディターに貼ってください
            </li>
          </ol>
        </section>

        {snapshot ? (
          <DownloadForm slug={view.slug} version={snapshot.version} viewerEmail={access.viewer?.email} />
        ) : (
          <div className="panel">
            <p className="muted">配布できる版がまだありません。</p>
          </div>
        )}

        <ReportForm slug={view.slug} />
      </main>
    </>
  );
}
