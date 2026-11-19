import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProjectNotFound from "../../app/dashboard/projects/[id]/not-found";
import { DashboardShell } from "./dashboard-shell";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const render = (path: string, children: React.ReactNode = null) => {
  pathname = path;
  return renderToStaticMarkup(<DashboardShell>{children}</DashboardShell>);
};

describe("DashboardShell project nav", () => {
  it("has no project section outside a project", () => {
    expect(render("/dashboard")).not.toContain(">Project<");
    expect(render("/dashboard/billing")).not.toContain(">Project<");
  });

  it("shows Overview and Install inside a project, in the sidebar and the mobile menu", () => {
    const html = render(`/dashboard/projects/${ID}/install`);
    expect(html.match(/>Project</g)).toHaveLength(2);
    const current = (html.match(/<a [^>]*>/g) ?? []).filter((tag) => tag.includes('aria-current="page"'));
    // Projects (account nav) + Install (project nav), once in the sidebar and once in the menu.
    expect(current.filter((tag) => tag.includes(`href="/dashboard/projects/${ID}/install"`))).toHaveLength(2);
    expect(current.filter((tag) => tag.includes('href="/dashboard"'))).toHaveLength(2);
  });

  it("hides the project section in the server HTML when the 404 page's marker is present", () => {
    const html = render(`/dashboard/projects/${ID}`, <ProjectNotFound />);
    // The 404 page renders the marker, and the section's CSS selector targets that same marker.
    expect(html).toContain("data-project-missing");
    expect(html).toContain("[body:has([data-project-missing])_&amp;]:hidden");
    expect(html).toContain("Project not found");
  });
});
