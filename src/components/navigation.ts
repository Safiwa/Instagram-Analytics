export type NavItem = {
  href: string;
  label: string;
};

// Primary links mirror the information hierarchy on the home page and the
// comparison workspace. Hash links point at the real section ids below.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Discover" },
  { href: "/discover", label: "Find creators" },
  { href: "/#global-pulse", label: "Leaderboards" },
  { href: "/#collaborations", label: "Collaborations" },
  { href: "/#metric-engine", label: "Analytics" },
  { href: "/compare", label: "Compare" },
  { href: "/connect", label: "For creators" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.startsWith("/#")) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
