import type { Metadata } from "next";
import { AtSign, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact us — Instagram Analytics",
  description: "Contact Campaign Masters, the marketing agency behind Instagram Analytics.",
};

const EMAIL = "campaign@instagram-analytics.com";
const INSTAGRAM_URL = "https://www.instagram.com/campaignmastersagency/";

export default function ContactPage() {
  return (
    <article data-testid="contact-page" className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Contact us</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Campaign Masters</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Leading marketing agency connecting brands with creators and managing events over the
          Middle East. Get in touch about campaigns, creator partnerships or events.
        </p>
      </header>

      <ul className="space-y-3">
        <li>
          <a
            href={`mailto:${EMAIL}`}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">E-mail</span>
              <span className="block text-sm font-semibold text-slate-950">{EMAIL}</span>
            </span>
          </a>
        </li>
        <li>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
              <AtSign className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Instagram</span>
              <span className="block text-sm font-semibold text-slate-950">@campaignmastersagency</span>
            </span>
          </a>
        </li>
      </ul>
    </article>
  );
}
