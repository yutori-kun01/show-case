import type { DemoMedia, EnvVarSpec, SetupConfig } from "@/lib/db/types";

/** 運営側の入力フォーム（1行1件のテキスト）とDBのJSONを行き来させる。 */

export function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** `KEY | 必須 | 説明 | 取得先URL` の形式。2列目は「必須」以外を任意として扱う。 */
export function parseEnvSpecs(value: string): EnvVarSpec[] {
  return parseLines(value).map((line) => {
    const [key = "", required = "", description = "", howToGet = ""] = line.split("|").map((part) => part.trim());
    return {
      key,
      required: /^(必須|required|true|yes|1)$/i.test(required),
      description,
      how_to_get: howToGet,
    };
  }).filter((spec) => spec.key.length > 0);
}

export function formatEnvSpecs(specs: EnvVarSpec[]): string {
  return specs
    .map((spec) => [spec.key, spec.required ? "必須" : "任意", spec.description, spec.how_to_get].join(" | "))
    .join("\n");
}

/** `URL | image|video | 説明` の形式。 */
export function parseDemoMedia(value: string): DemoMedia[] {
  return parseLines(value)
    .map((line) => {
      const [url = "", kind = "image", caption = ""] = line.split("|").map((part) => part.trim());
      return { url, kind: kind === "video" ? ("video" as const) : ("image" as const), caption };
    })
    .filter((media) => media.url.length > 0);
}

export function formatDemoMedia(media: DemoMedia[]): string {
  return media.map((item) => [item.url, item.kind, item.caption ?? ""].join(" | ")).join("\n");
}

export function parseTags(value: string): string[] {
  return value
    .split(/[,、\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseSetupConfig(form: {
  requirements: string;
  setup: string;
  start: string;
  open_url: string;
  env: string;
}): SetupConfig {
  return {
    requirements: parseLines(form.requirements),
    setup: form.setup.trim(),
    start: form.start.trim(),
    open_url: form.open_url.trim(),
    env: parseEnvSpecs(form.env),
  };
}

/** 公開URLに使えるslugへ整える。 */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
