import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — Instagram Analytics",
};

type PrivacyPageProps = {
  searchParams: Promise<{ deletion?: string }>;
};

const UPDATED = "25 November 2026";
const CONTACT = "campaign@instagram-analytics.com";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const { deletion } = await searchParams;
  const code = deletion && /^[a-f0-9]{16}$/.test(deletion) ? deletion : null;

  return (
    <article data-testid="privacy-page" className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Legal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Privacy policy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Instagram Analytics by Campaign Masters UAE · Last updated {UPDATED}
        </p>
      </header>

      {code ? (
        <div
          data-testid="deletion-confirmation"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Data deletion request <strong>{code}</strong> is complete. Your connection, access token and
          shared insights have been deleted.
        </div>
      ) : null}

      <Section title="Who we are">
        <p>
          Instagram Analytics (instagram-analytics.com) is operated by Campaign Masters UAE, a
          marketing agency in Dubai, United Arab Emirates. Contact: {CONTACT}.
        </p>
      </Section>

      <Section title="Public Instagram data">
        <p>
          When anyone looks up an Instagram handle, or when our daily collector refreshes a tracked
          account, we store what Instagram shows publicly for that account: username, display name,
          category, verification, follower, following and post counts, and the captions, hashtags,
          locations, likes, comments and views of recent public posts. We keep one snapshot per day to
          show trends. We do not store private accounts&apos; posts, and we never use a login to read
          public data.
        </p>
      </Section>

      <Section title="Creators who connect their account">
        <p>
          If you connect your Instagram professional account with &quot;Connect with Instagram&quot;,
          you log in with Instagram or Facebook through Meta and grant the permissions
          instagram_basic and instagram_manage_insights for the account and business portfolio you
          choose. Meta also requires the instagram_manage_messages permission for this kind of
          login; we never read or send messages. We read your username and follower count, your follower
          demographics (country, city, age, gender) and 28-day account insights (reach, views,
          accounts engaged, interactions, likes, comments, saves, shares). We show these on your
          public profile page on this site, labelled as shared by you.
        </p>
        <p>
          We store the access token Meta issues for your business portfolio encrypted (AES-256-GCM)
          and use it only to refresh these insights once a day. We cannot post, comment, send messages or change anything on
          your account, and we never see your password.
        </p>
      </Section>

      <Section title="Follower-list audit">
        <p>
          A connected creator can upload the followers file from Instagram&apos;s &quot;Download
          your information&quot; export to have their followers checked for fake accounts. For each
          listed follower (all of them, or a random sample of 300 for larger lists) we read the
          public profile and keep only what the check needs: post, follower and following counts,
          whether a profile photo, name and bio exist, and whether the account is private. We do
          not keep followers&apos; posts, photos or bio text. This data is deleted when the creator
          disconnects or uploads a new list.
        </p>
      </Section>

      <Section title="Email digest">
        <p>
          If you subscribe to the weekly digest we store your email address and the handle you
          follow, only to send that email. Every email has a one-click unsubscribe link that deletes
          the subscription.
        </p>
      </Section>

      <Section title="Where data is stored">
        <p>
          The site runs on Vercel. Snapshots and connected-account data are stored in a Neon Postgres
          database. Digest subscriptions are stored in Upstash Redis and sent with Resend. We do not sell personal data or share it with advertisers.
        </p>
      </Section>

      <Section id="data-deletion" title="Deleting your data">
        <p>
          Connected creators can delete everything we hold from their connection at any time on the{" "}
          <a href="/connect" className="font-medium text-indigo-600">For creators</a> page with
          &quot;Disconnect and delete my insights&quot;. Removing our app&apos;s access in Meta
          (Business settings → Integrations, or Instagram → Settings → Website permissions → Apps
          and websites) also deletes it automatically, as does a data deletion request sent
          through Instagram or Facebook.
        </p>
        <p>
          To ask us to remove public snapshots of your account, or for any other privacy request,
          email {CONTACT} from an address we can verify, and we will respond within 30 days.
        </p>
      </Section>

      <Section title="Changes">
        <p>We will update this page when our data practices change, with a new date above.</p>
      </Section>
    </article>
  );
}
