import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { ChatPanel } from "../../components/embed/chat-panel";
import { parseEmbedParams } from "../../lib/embed/origin";

type EmbedPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The widget panel, inside the loader's iframe (project.md §6.5). */
export default async function EmbedPage({ searchParams }: EmbedPageProps) {
  const params = parseEmbedParams(await searchParams);
  // A missing or bad key/origin renders an empty page: no error text for the host site.
  if (!params) return null;
  // P2P-T10 swaps in the project's plan-applied config.
  const config = DEFAULT_WIDGET_CONFIG;
  return <ChatPanel config={config} publicKey={params.key} origin={params.origin} />;
}
