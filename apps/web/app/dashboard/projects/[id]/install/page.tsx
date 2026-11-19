import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { EmptyState } from "../../../../../components/dashboard/empty-state";
import { PageHeader } from "../../../../../components/dashboard/page-header";
import { loadOwnedProject } from "../load-project";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Install" };

// Placeholder so the Install nav link works. P2P-T06 builds the real page.
export default async function InstallPage({ params }: Props) {
  await auth.protect();
  const project = await loadOwnedProject((await params).id);

  return (
    <>
      <PageHeader title="Install" description={`Add the ${project.name} widget to your site.`} />
      <EmptyState title="Install instructions are coming soon" description="The script tag for this project will be here." />
    </>
  );
}
