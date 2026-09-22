import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "管理",
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
