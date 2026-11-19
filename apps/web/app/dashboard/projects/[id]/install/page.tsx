import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/dashboard/page-header";
import { InstallSnippet } from "../../../../../components/projects/install-snippet";
import { widgetSnippet } from "../../../../../components/projects/widget-snippet";
import { GlassPanel } from "../../../../../components/ui/glass-panel";
import { appUrl } from "../../../../../lib/app-url";
import { loadOwnedProject } from "../load-project";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Install" };

export default async function InstallPage({ params }: Props) {
  await auth.protect();
  // Owner check through getOwnedProject (owner client, RLS). Unknown or not theirs → 404 page.
  const project = await loadOwnedProject((await params).id);
  const snippet = widgetSnippet(appUrl(), project.publicKey);

  return (
    <>
      <PageHeader title="Install" description={`Add the chat widget for ${project.name} to your website.`} />
      <GlassPanel className="min-w-0 p-5 sm:p-6">
        <ol className="flex flex-col gap-8">
          <Step number={1} title="Copy the script tag">
            <p className="mb-4 text-sm text-fg-muted">
              It loads the widget with this project&apos;s public key. The key only identifies the project, so it&apos;s
              safe in your page&apos;s HTML.
            </p>
            <InstallSnippet snippet={snippet} />
          </Step>
          <Step number={2} title="Paste it before </body>">
            <p className="text-sm text-fg-muted">
              Add it to your site&apos;s HTML just before the closing <code className="font-mono">&lt;/body&gt;</code>{" "}
              tag, on every page where the chat should appear.
            </p>
          </Step>
          <Step number={3} title="Reload your site">
            <p className="text-sm text-fg-muted">
              The chat button appears in the bottom-right corner by default.
            </p>
          </Step>
        </ol>
      </GlassPanel>
    </>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 gap-4">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary text-xs font-semibold text-primary-fg"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="mb-1 text-base font-semibold tracking-tight">
          <span className="sr-only">Step {number}: </span>
          {title}
        </h2>
        {children}
      </div>
    </li>
  );
}
