import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { currentViewerAccess, safeNextPath } from "@/lib/auth/viewer";
import { getSiteSettings } from "@/lib/services/access";
import { AccessForm } from "./AccessForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function AccessPage({ searchParams }: Props) {
  const next = safeNextPath((await searchParams).next);
  const access = await currentViewerAccess();
  if (access.allowed) redirect(next);

  const settings = await getSiteSettings();
  const mode = settings.access_mode === "allowlist" ? "allowlist" : "register";

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ maxWidth: 520 }}>
        <h1>ログイン</h1>
        <p className="lead">このサイトは登録した方だけが見られます。</p>
        <AccessForm next={next} mode={mode} verify={settings.verify_email} />
      </main>
    </>
  );
}
