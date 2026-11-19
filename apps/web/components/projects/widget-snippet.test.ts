import { describe, expect, it } from "vitest";
import { widgetSnippet } from "./widget-snippet";

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

describe("widgetSnippet", () => {
  it("is the script tag with the app's widget.js and the project's key", () => {
    expect(widgetSnippet("https://askwell-git-x-team.vercel.app", KEY)).toBe(
      `<script src="https://askwell-git-x-team.vercel.app/widget.js" data-key="${KEY}" defer></script>`,
    );
    expect(widgetSnippet("http://localhost:3000", KEY)).toBe(
      `<script src="http://localhost:3000/widget.js" data-key="${KEY}" defer></script>`,
    );
  });

  it("accepts a bracketed IPv6 origin, as appUrl() returns it", () => {
    expect(widgetSnippet("http://[::1]:3000", KEY)).toBe(
      `<script src="http://[::1]:3000/widget.js" data-key="${KEY}" defer></script>`,
    );
  });

  it("rejects an app URL that isn't a bare http(s) origin", () => {
    for (const url of ["https://askwell.app/", "https://askwell.app/x", "askwell.app", "javascript:alert(1)", 'https://a.app"onload="x', "https://user@a.app", "http://[::1", "ftp://a.app"]) {
      expect(() => widgetSnippet(url, KEY), url).toThrow();
    }
  });

  it("rejects a key that isn't a public key", () => {
    for (const key of ["", "sk_secret", 'pk_abc" onload="alert(1)', "pk_short"]) {
      expect(() => widgetSnippet("https://askwell.app", key), key).toThrow(/invalid public key/);
    }
  });
});
