import Link from "next/link";
import { opsUrl } from "@/lib/opsPath";

export function OpsNav({ current }: { current: string }) {
  const items = [
    { href: "/", label: "ホーム" },
    { href: "/repos", label: "リポジトリ" },
    { href: "/listings", label: "公開ページ" },
    { href: "/mask", label: "マスク設定" },
    { href: "/reports", label: "通報" },
  ];
  return (
    <nav className="ops-nav">
      {items.map((item) => (
        <Link key={item.href} href={opsUrl(item.href)} aria-current={current === item.href ? "page" : undefined}>
          {current === item.href ? <strong>{item.label}</strong> : item.label}
        </Link>
      ))}
    </nav>
  );
}
