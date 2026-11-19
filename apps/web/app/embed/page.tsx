import { ChatPanel } from "../../components/embed/chat-panel";
import { parseEmbedParams } from "../../lib/embed/origin";
import { getWidgetConfigByKey } from "../../lib/widget/config";

type EmbedPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The widget panel, inside the loader's iframe (project.md §6.5). */
export default async function EmbedPage({ searchParams }: EmbedPageProps) {
  const params = parseEmbedParams(await searchParams);
  // A missing or bad key/origin renders an empty page: no error text for the host site.
  if (!params) return null;

  // The project's plan-applied config, read on the server. Unknown key → empty page too.
  let config;
  try {
    config = await getWidgetConfigByKey(params.key);
  } catch (error) {
    console.error("[embed] widget config lookup failed", error);
    return null;
  }
  if (!config) return null;

  return <ChatPanel config={config} publicKey={params.key} origin={params.origin} />;
}
