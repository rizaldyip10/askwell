// P6H-T05: project.md §9 "XSS". Visitor messages and bot replies render as text, never HTML,
// in the widget (/embed) and the dashboard (Conversations). React escapes text children,
// so the rule holds as long as nothing uses an HTML sink. This checks there is none, and
// renders the /embed bubble with markup to prove it comes out as text.
// (Conversations has the same render check in components/conversations/conversations.test.tsx.)

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { MessageBubble } from "../../../components/embed/message-bubble";
import { REPO_DIR, type SourceFile, stripComments, webSources } from "./source";

const HTML_SINKS = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|\bsrcdoc\b/;
const ATTACK = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

let sources: SourceFile[];

beforeAll(async () => {
  sources = await webSources();
});

describe("apps/web", () => {
  it("has no HTML sink anywhere (dangerouslySetInnerHTML, innerHTML, srcdoc, …)", () => {
    expect(sources.filter((f) => HTML_SINKS.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it("the /embed bubble and the Conversations thread render the message as a text child", () => {
    const bubble = sources.find((f) => f.path === "components/embed/message-bubble.tsx")?.code ?? "";
    const thread = sources.find((f) => f.path === "components/conversations/thread.tsx")?.code ?? "";
    expect(bubble).toMatch(/^\s*\{message\.text\}\s*$/m);
    expect(thread).toMatch(/^\s*\{m\.body\}\s*$/m);
  });

  it.each(["visitor", "bot"] as const)("a %s message with markup renders as text in /embed", (role) => {
    const html = renderToStaticMarkup(<MessageBubble message={{ id: "1", role, text: ATTACK }} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;");
  });
});

describe("apps/widget (the loader on customer sites)", () => {
  it("its only HTML sink is the constant chat icon; messages never pass through it", async () => {
    const dir = join(REPO_DIR, "apps", "widget", "src");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const sinks: string[] = [];
    for (const file of files) {
      const code = stripComments(await readFile(join(dir, file), "utf8"));
      for (const line of code.split("\n")) if (HTML_SINKS.test(line)) sinks.push(`${file}: ${line.trim()}`);
    }
    expect(sinks).toEqual(["widget.ts: button.innerHTML = ICON;"]);
    const widget = stripComments(await readFile(join(dir, "widget.ts"), "utf8"));
    // ICON is a string literal, assigned once.
    expect(widget).toMatch(/const ICON =\s*'<svg [^']*<\/svg>';/);
    expect(widget.match(/\bICON\s*=/g)).toHaveLength(1);
  });
});
