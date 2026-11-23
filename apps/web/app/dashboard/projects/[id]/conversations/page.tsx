import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ConversationsView } from "../../../../../components/conversations/conversations-view";
import { PageHeader } from "../../../../../components/dashboard/page-header";
import { listConversations } from "../../../../../lib/conversations";
import { loadOwnedProject } from "../load-project";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage({ params }: Props) {
  await auth.protect();
  // Owner check through getOwnedProject (owner client, RLS). Unknown or not theirs → 404 page.
  const project = await loadOwnedProject((await params).id);
  // The first page, newest first, through the owner client. A failure throws to error.tsx.
  const initial = await listConversations(project.id);

  return (
    <>
      <PageHeader title="Conversations" description={`What visitors asked the ${project.name} bot.`} />
      <ConversationsView projectId={project.id} initial={initial} />
    </>
  );
}
