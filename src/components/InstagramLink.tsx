import { ExternalLink } from "lucide-react";
import { instagramProfileUrl } from "../core/format";

type InstagramLinkProps = {
  username: string;
  className?: string;
};

export function InstagramLink({ username, className = "" }: InstagramLinkProps) {
  const label = `Open @${username} on Instagram`;
  return (
    <a
      href={instagramProfileUrl(username)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide transition hover:underline ${className}`}
    >
      Instagram
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
