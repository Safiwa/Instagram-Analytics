"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isNavItemActive, PRIMARY_NAV } from "./navigation";

function linkClass(active: boolean): string {
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? "bg-indigo-50 text-indigo-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
  }`;
}

export function SiteNav() {
  const pathname = usePathname();
  // Remembering the route the menu was opened on closes it automatically
  // after navigation without an extra render pass.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const open = openOnPath === pathname;
  const close = () => setOpenOnPath(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOnPath(null);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
        {PRIMARY_NAV.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 lg:hidden"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-primary-navigation"
        onClick={() => setOpenOnPath(open ? null : pathname)}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <nav
          id="mobile-primary-navigation"
          aria-label="Mobile primary"
          className="absolute inset-x-0 top-full z-50 border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-lg lg:hidden"
        >
          <div className="mx-auto max-w-7xl space-y-1">
            {PRIMARY_NAV.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                  className={`block ${linkClass(active)}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}
