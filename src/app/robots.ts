import type { MetadataRoute } from "next";

/**
 * 運営側の入口は robots.txt に書かない。ここに書くと秘匿パスをそのまま公開してしまうため、
 * 運営側は noindex ヘッダーと未認証404で扱う。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
  };
}
