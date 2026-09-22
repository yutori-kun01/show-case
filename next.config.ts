import type { NextConfig } from "next";

const config: NextConfig = {
  // 運営側の入口はビルド時に固定せず、実行時の環境変数で解決する。
  // （ハードコードを避けるため rewrite などでパスを埋め込まない）
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
