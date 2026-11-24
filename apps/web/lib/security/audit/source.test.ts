// The audit tests read `code` (comments blanked). A rule must not hide behind a string that
// looks like a comment, and a comment must not count as code.
import { describe, expect, it } from "vitest";
import { stripComments } from "./source";

describe("stripComments", () => {
  it("keeps a string with // and the code after it (an HTML sink stays visible)", () => {
    const text = 'const path = "/a//b"; node.innerHTML = message;';
    expect(stripComments(text, "x.ts")).toBe(text);
  });

  it("keeps /* and */ inside strings, templates and regexes", () => {
    const text = 'const a = "/* not */"; const b = `x // ${y} /* z */`; const c = /\\/\\/.*/; el.innerHTML = a;';
    expect(stripComments(text, "x.ts")).toBe(text);
  });

  it("keeps a URL string", () => {
    const text = 'fetch("https://example.com/a"); el.innerHTML = x;';
    expect(stripComments(text, "x.ts")).toBe(text);
  });

  it("blanks line and block comments, keeping line breaks and the code around them", () => {
    const text = 'a(); // dangerouslySetInnerHTML\n/* el.innerHTML =\n x */ b();\nc(); /** doc */';
    const out = stripComments(text, "x.ts");
    expect(out).not.toMatch(/innerHTML|dangerously|doc/);
    expect(out.split("\n")).toHaveLength(4);
    expect(out).toMatch(/^a\(\);\s+\n\s+\n\s+b\(\);\nc\(\);\s+$/);
    expect(out).toHaveLength(text.length);
  });

  it("keeps // in JSX text and blanks JSX comments", () => {
    const text = 'const x = <p>see http://a.b // here{/* hidden */}<b dangerouslySetInnerHTML={y} /></p>;';
    const out = stripComments(text, "x.tsx");
    expect(out).toContain("see http://a.b // here");
    expect(out).not.toContain("hidden");
    expect(out).toContain("dangerouslySetInnerHTML={y}");
  });

  it("blanks a comment at the very end of the file", () => {
    expect(stripComments("a();\n// innerHTML", "x.ts")).toBe(`a();\n${" ".repeat("// innerHTML".length)}`);
  });
});
