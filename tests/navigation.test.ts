import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isNavItemActive, PRIMARY_NAV } from "../src/components/navigation";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("primary navigation", () => {
  it("links the page-based sections and the comparison workspace", () => {
    expect(PRIMARY_NAV).toEqual([
      { href: "/", label: "Discover" },
      { href: "/discover", label: "Find creators" },
      { href: "/#global-pulse", label: "Leaderboards" },
      { href: "/#collaborations", label: "Collaborations" },
      { href: "/#metric-engine", label: "Analytics" },
      { href: "/compare", label: "Compare" },
      { href: "/connect", label: "For creators" },
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact Us" },
      { href: "/account", label: "Account" },
    ]);
  });

  it("points every hash link at a real section id", () => {
    const homepage = source("src/app/page.tsx");
    const globalPulse = source("src/features/leaderboard/GlobalPulse.tsx");
    const markup = `${homepage}\n${globalPulse}`;

    for (const item of PRIMARY_NAV) {
      if (!item.href.startsWith("/#")) {
        continue;
      }

      const id = item.href.slice(2);
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it("marks routes active without matching partial path segments", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/compare", "/")).toBe(false);
    expect(isNavItemActive("/compare", "/compare")).toBe(true);
    expect(isNavItemActive("/discover", "/discover")).toBe(true);
    expect(isNavItemActive("/discover", "/")).toBe(false);
    expect(isNavItemActive("/compare/results", "/compare")).toBe(true);
    expect(isNavItemActive("/comparison", "/compare")).toBe(false);
  });

  it("never marks in-page hash links active", () => {
    expect(isNavItemActive("/", "/#global-pulse")).toBe(false);
    expect(isNavItemActive("/compare", "/#collaborations")).toBe(false);
  });
});

describe("responsive header navigation", () => {
  it("exposes a desktop nav and a three-bar mobile menu", () => {
    const nav = source("src/components/SiteNav.tsx");

    expect(nav).toContain('aria-label="Primary"');
    expect(nav).toContain("hidden items-center gap-1 lg:flex");
    expect(nav).toContain("Menu");
    expect(nav).toContain('aria-label={open ? "Close navigation menu" : "Open navigation menu"}');
    expect(nav).toContain("aria-expanded={open}");
    expect(nav).toContain('id="mobile-primary-navigation"');
    expect(nav).toContain("lg:hidden");
  });

  it("closes the mobile menu on route change, link selection, and Escape", () => {
    const nav = source("src/components/SiteNav.tsx");

    expect(nav).toContain("usePathname()");
    expect(nav).toContain("const open = openOnPath === pathname");
    expect(nav).toContain("setOpenOnPath(null)");
    expect(nav).toContain('event.key === "Escape"');
    expect(nav).toContain("onClick={close}");
  });

  it("keeps hash targets clear of the sticky header", () => {
    expect(source("src/app/globals.css")).toContain("scroll-padding-top: 5rem");
    expect(source("src/app/layout.tsx")).toContain("sticky top-0");
  });

  it("brands the logo as Instagram Analytics by Creative Masters Agency", () => {
    const layout = source("src/app/layout.tsx");

    expect(layout).toContain("Instagram Analytics");
    expect(layout.match(/By Creative Masters Agency/g)).toHaveLength(2);
    expect(layout).not.toContain("by Campaign Masters");
  });

  it("lists the company contact details on the Contact Us page", () => {
    const page = source("src/app/contact/page.tsx");
    expect(page).toContain("campaign@instagram-analytics.com");
    expect(page).toContain("https://www.instagram.com/campaignmastersagency/");
  });
});
