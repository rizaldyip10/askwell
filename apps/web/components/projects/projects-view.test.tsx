import type { Project } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectsView } from "./projects-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const project = (id: string, name: string): Project => ({
  id,
  name,
  publicKey: `pk_${id.padEnd(32, "0")}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-19T00:00:00Z",
});

describe("ProjectsView", () => {
  it("shows the empty state with the create form when there are no projects", () => {
    const html = renderToStaticMarkup(<ProjectsView projects={[]} />);
    expect(html).toContain("Create your first project");
    expect(html).toContain("Project name");
    expect(html).toContain(">Create project<");
    expect(html).not.toContain("Your projects");
  });

  it("lists each project with its name, created date and a link to it", () => {
    const html = renderToStaticMarkup(
      <ProjectsView projects={[project("a1", "Docs site"), project("b2", "Shop")]} />,
    );
    expect(html).toContain('aria-label="Your projects"');
    expect(html).toContain('href="/dashboard/projects/a1"');
    expect(html).toContain('href="/dashboard/projects/b2"');
    expect(html).toContain(">Docs site<");
    expect(html).toContain('<time dateTime="2026-11-19T00:00:00Z">Nov 19, 2026</time>');
    expect(html).toContain('aria-label="Rename Shop"');
    expect(html).toContain('aria-label="Delete Shop"');
    // The create form is still there, and never hidden by plan on the client.
    expect(html).toContain(">Create project<");
  });

  it("renders project names as text, never HTML (§9 XSS)", () => {
    const html = renderToStaticMarkup(<ProjectsView projects={[project("x1", '<img src=x onerror="alert(1)">')]} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
