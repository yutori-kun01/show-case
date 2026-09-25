import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveViewerAccess, type ViewerAccess } from "@/lib/services/access";
import { VIEWER_COOKIE } from "./session";

/** 公開側の現在の閲覧者。 */
export async function currentViewerAccess(): Promise<ViewerAccess> {
  const store = await cookies();
  return resolveViewerAccess(store.get(VIEWER_COOKIE)?.value);
}

/** 見てよくなければログイン画面へ送る。戻り先は同じサイト内のパスだけにする。 */
export async function requireViewer(nextPath: string): Promise<ViewerAccess> {
  const access = await currentViewerAccess();
  if (!access.allowed) redirect(`/access?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return access;
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
