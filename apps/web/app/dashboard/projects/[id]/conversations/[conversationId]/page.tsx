import { idSchema } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatFullTime, messageCountLabel } from "../../../../../../components/conversations/format";
import { conversationsPath } from "../../../../../../components/conversations/paths";
import { Thread } from "../../../../../../components/conversations/thread";
import { PageHeader } from "../../../../../../components/dashboard/page-header";
import { GlassPanel } from "../../../../../../components/ui/glass-panel";
import { getConversationThread } from "../../../../../../lib/conversations";
import { loadOwnedProject } from "../../load-project";
import { TAP_MIN } from "../../../../../../components/ui/tap-target";

type Props = { params: Promise<{ id: string; conversationId: string }> };

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: Props) {
  await auth.protect();
  const { id, conversationId } = await params;
  // Owner check through getOwnedProject (owner client, RLS). Unknown or not theirs → 404 page.
  const project = await loadOwnedProject(id);
  if (!idSchema.safeParse(conversationId).success) notFound();
  // Owner client: another owner's conversation reads as no row. One from another of this
  // owner's projects is refused too, so the URL always matches the project nav.
  const thread = await getConversationThread(conversationId);
  if (!thread || thread.conversation.projectId !== project.id) notFound();

  const { conversation, messages } = thread;
  const listHref = conversationsPath(project.id);

  return (
    <>
      <Link
        href={listHref}
        className={`mb-4 inline-flex items-center gap-1 ${TAP_MIN} text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline`}
      >
        <span aria-hidden="true">←</span> All conversations
      </Link>
      <PageHeader
        title="Conversation"
        description={
          <>
            Started <time dateTime={conversation.createdAt}>{formatFullTime(conversation.createdAt)}</time> ·{" "}
            {messageCountLabel(messages.length)}
          </>
        }
      />
      <GlassPanel as="section" aria-label="Thread" className="min-w-0 p-4 sm:p-6">
        <Thread messages={messages} />
      </GlassPanel>
    </>
  );
}
