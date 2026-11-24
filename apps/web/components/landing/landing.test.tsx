import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";
import { EXAMPLE_PUBLIC_KEY, Install, installSnippet } from "./install";
import { SiteHeader } from "./site-header";

/** [href, text] for every link in `html`. */
function links(html: string): [string, string][] {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(([, href = "", text = ""]) => [href, text]);
}

describe("SiteHeader", () => {
  const html = renderToStaticMarkup(<SiteHeader />);

  it("links Sign in to the Clerk sign-in page", () => {
    expect(links(html)).toContainEqual([SIGN_IN_PATH, "Sign in"]);
  });

  it("links Start free to the Clerk sign-up page", () => {
    expect(links(html)).toContainEqual([SIGN_UP_PATH, "Start free"]);
  });

  it("shows both links on mobile (outside the md-only nav)", () => {
    const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    expect(nav).not.toContain("Sign in");
    expect(nav).not.toContain("Start free");
    expect(html).toContain("Sign in");
  });
});

describe("installSnippet", () => {
  it("loads widget.js from the given app URL with the example key and defer", () => {
    const snippet = installSnippet("https://askwell-git-x-team.vercel.app");
    expect(snippet).toContain('src="https://askwell-git-x-team.vercel.app/widget.js"');
    expect(snippet).toContain(`data-key="${EXAMPLE_PUBLIC_KEY}"`);
    expect(snippet).toMatch(/\bdefer\b/);
    expect(snippet).not.toMatch(/\basync\b/);
  });

  it("renders the snippet as text in the Install section", () => {
    const html = renderToStaticMarkup(<Install appUrl="http://localhost:3000" />);
    expect(html).toContain("src=&quot;http://localhost:3000/widget.js&quot;");
    expect(html).not.toContain("<script");
  });

  it("leaves no example.com URL in the landing components", () => {
    const dir = __dirname;
    for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toContain("example.com");
    }
  });
});
