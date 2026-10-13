import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import robots from "./robots";

describe("sitemap", () => {
  it("includes every static page", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/shop"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/lookbook"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/about"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/contact"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/policies"))).toBe(true);
  });
});

describe("robots", () => {
  it("disallows account/admin/lister areas", () => {
    const result = robots();
    const disallow = (result.rules as { disallow?: string[] }).disallow ?? [];
    expect(disallow).toContain("/admin");
    expect(disallow).toContain("/account");
  });
});
