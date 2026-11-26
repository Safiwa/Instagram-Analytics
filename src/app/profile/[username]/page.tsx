import { after } from "next/server";
import { EmptyState } from "../../../components/EmptyState";
import { isMiddleEastAccount } from "../../../core/analytics/country";
import { excludedExclusiveHandles } from "../../../core/analytics/exclusive";
import { analyzeGrowth } from "../../../core/analytics/growth";
import { computeMetrics, type ProfileMetrics } from "../../../core/analytics/metrics";
import { buildPeerRanking, findClosestPeer } from "../../../core/analytics/peer";
import {
  buildKeyComparisons,
  buildRegionalRanking,
  findRegionalCategoryPeer,
} from "../../../core/analytics/regional";
import { resolveProfile } from "../../../core/data/adapter";
import { getTrackedProfiles } from "../../../core/data/leaderboard";
import {
  getAgencyProfiles,
  getIndexedPool,
  getRegionalProfiles,
  mergePools,
} from "../../../core/data/regional";
import type { CreatorProfile } from "../../../core/data/types";
import { indexPosition } from "../../../core/analytics/benchmark";
import { withStoredHistory } from "../../../core/db/enrich";
import { getIndexSample } from "../../../core/db/indexStore";
import { recordProfileSnapshot } from "../../../core/db/snapshots";
import { ProfileDashboard } from "../../../features/profile/ProfileDashboard";
import { ensureRecordedLocations } from "../../../core/db/accountLocations";
import { getPostHistory } from "../../../core/db/postHistory";
import { estimateFollowerHistory } from "../../../core/analytics/estimatedHistory";
import { listTrackedHandles, recordLookups } from "../../../core/billing/accounts";
import { trimHistory } from "../../../core/billing/plans";
import { checkLookups, getViewer } from "../../../core/billing/viewer";
import { ProfilePlanBar } from "../../../features/billing/ProfilePlanBar";
import { UpgradeNotice } from "../../../features/billing/UpgradeNotice";
import { normalizeHandle } from "../../../core/data/adapter";

export const maxDuration = 60;

type ProfilePageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ track?: string }>;
};

const TRACK_NOTICES: Record<string, string> = {
  added: "Added to daily tracking. A snapshot is stored every day from now on.",
  limit: "Your plan's daily-tracking allowance is used up. Remove an account on your Account page or upgrade.",
  error: "Daily tracking could not be updated. Please try again.",
};

const RANK_PEERS = 9;

type Benchmarks = {
  peer: ReturnType<typeof findClosestPeer>;
  ranking: ReturnType<typeof buildPeerRanking>;
  regionalPeer: ReturnType<typeof findRegionalCategoryPeer>;
  regionalRanking: ReturnType<typeof buildRegionalRanking>;
};

function buildBenchmarks(
  profile: CreatorProfile,
  metrics: ProfileMetrics,
  tracked: CreatorProfile[],
  regionalPool: CreatorProfile[],
): Benchmarks {
  return {
    peer: findClosestPeer(profile, metrics, tracked),
    // Ten profiles per rank table: the searched account plus nine peers.
    ranking: buildPeerRanking(profile, metrics, tracked, RANK_PEERS),
    regionalPeer: findRegionalCategoryPeer(profile, metrics, regionalPool),
    regionalRanking: buildRegionalRanking(profile, metrics, regionalPool, RANK_PEERS),
  };
}

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const [{ username }, { track }] = await Promise.all([params, searchParams]);
  let handle = normalizeHandle(username);
  try {
    handle = normalizeHandle(decodeURIComponent(username));
  } catch {
    // Malformed escape: keep the raw value; it simply will not resolve.
  }
  const viewer = await getViewer();
  // Plan limit: distinct profiles per day (Free) or month (paid). Checked
  // before the lookup so a blocked visitor costs no Instagram request.
  const gate = await checkLookups(viewer, [handle]);
  if (!gate.allowed) {
    const limits = viewer.plan.limits;
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">@{handle}</h1>
        <UpgradeNotice
          testId="lookup-limit"
          signedIn={viewer.user !== null}
          title={`You have used all ${limits.lookups} lookups for this ${limits.lookupPeriod}`}
          description={
            viewer.plan.id === "free"
              ? "Free accounts can open 3 profiles a day. Upgrade for up to 1,500 a month, daily tracking and longer history. Pro comes with a 14-day free trial."
              : "Profiles you already opened this month stay available. Move to a bigger plan for more lookups."
          }
        />
      </div>
    );
  }
  const [resolution] = await Promise.all([resolveProfile(username), ensureRecordedLocations()]);

  if (resolution.status !== "found") {
    return (
      <EmptyState
        title={resolution.status === "not_found" ? "Profile not found" : "Profile unavailable"}
        description={resolution.message}
        action={{ href: "/", label: "Back to directory" }}
      />
    );
  }

  const resolved = resolution.profile;
  // Today's snapshot is written after the response is sent, so storing history
  // never slows the page down. Demo fixtures are never stored.
  after(() => recordProfileSnapshot(resolved, { lookup: true }));
  const subject = viewer.subject;
  if (subject && resolved.source !== "demo" && gate.toRecord.length > 0) {
    after(() => recordLookups(subject, gate.period, gate.toRecord));
  }

  const [stored, trackedOnly, sample, indexed, agencyIndexed, postHistory, myTracked] =
    await Promise.all([
      withStoredHistory(resolved),
      getTrackedProfiles(),
      resolved.source === "demo" ? Promise.resolve([]) : getIndexSample(),
      resolved.source === "demo" ? Promise.resolve([]) : getIndexedPool(),
      resolved.source === "demo" ? Promise.resolve([]) : getAgencyProfiles(),
      // Up to a year of post metrics (Business and Creator accounts only), read
      // at most once a day per account; never fails the page.
      resolved.source === "live"
        ? getPostHistory(resolved.username).catch(() => null)
        : Promise.resolve(null),
      viewer.user
        ? listTrackedHandles(viewer.user.id).catch(() => [] as string[])
        : Promise.resolve([] as string[]),
    ]);
  // Stored daily history is limited to the plan's window.
  const historyDays = viewer.plan.limits.historyDays;
  const keptPoints = stored.tracking ? trimHistory(stored.tracking.points, historyDays) : [];
  const historyTrimmed = Boolean(stored.tracking && keptPoints.length < stored.tracking.points.length);
  const profile =
    stored.tracking && historyTrimmed
      ? keptPoints.length > 0
        ? { ...stored, tracking: { since: keptPoints[0].date, points: keptPoints } }
        : { ...stored, tracking: undefined }
      : stored;
  // The same-country peer card and five-row rank table draw on tracked accounts
  // plus every profile this site has indexed, so smaller accounts and niche
  // categories (e.g. marketing agencies) find real same-country peers. The
  // curated agency handles are loaded explicitly because a thin agency category
  // can fall outside the general top-400 index.
  const tracked = mergePools(mergePools(trackedOnly, indexed), agencyIndexed);
  // The Middle East panel is hidden for accounts outside the region, so its
  // peer pool is only loaded for Middle East accounts.
  const regionalPool = isMiddleEastAccount(profile) ? await getRegionalProfiles() : [];
  const metrics = computeMetrics(profile);
  const position =
    metrics.engagementSource === "unavailable"
      ? null
      : indexPosition(profile.username, profile.followers, metrics.engagementRate, sample);
  const growth = analyzeGrowth(profile);
  // Estimated weekly followers for the year before daily tracking began,
  // labelled Est. on the chart. Demo and private profiles get none.
  const firstMeasured = profile.tracking?.points[0];
  const followerEstimate =
    resolved.source === "demo" || profile.isPrivate
      ? []
      : estimateFollowerHistory({
          anchorFollowers: firstMeasured?.followers ?? profile.followers,
          anchorDate: firstMeasured?.date ?? new Date().toISOString().slice(0, 10),
          growthPct12m: metrics.followerGrowthPct,
          posts: postHistory?.posts ?? [],
        });
  const initial = buildBenchmarks(profile, metrics, tracked, regionalPool);
  const excluded = excludedExclusiveHandles(initial);
  // Remove duplicate peers from the pools before ranking, so a five-profile
  // panel keeps all five rows instead of losing the duplicate's row afterwards.
  const { peer, ranking, regionalPeer, regionalRanking } =
    excluded.size === 0
      ? initial
      : buildBenchmarks(
          profile,
          metrics,
          tracked.filter((candidate) => !excluded.has(candidate.username.toLowerCase())),
          regionalPool.filter((candidate) => !excluded.has(candidate.username.toLowerCase())),
        );
  const regionalComparison = regionalPeer
    ? buildKeyComparisons(profile, metrics, regionalPeer)
    : [];

  const dashboard = (
    <ProfileDashboard
      profile={profile}
      metrics={metrics}
      growth={growth}
      peer={peer}
      ranking={ranking}
      regionalPeer={regionalPeer}
      regionalComparison={regionalComparison}
      regionalRanking={regionalRanking}
      indexPosition={position}
      postHistory={postHistory}
      followerEstimate={followerEstimate}
    />
  );

  if (!viewer.billingEnabled) {
    return dashboard;
  }
  return (
    <div className="space-y-4">
      {track && TRACK_NOTICES[track] ? (
        <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {TRACK_NOTICES[track]}
        </p>
      ) : null}
      <ProfilePlanBar
        handle={profile.username.toLowerCase()}
        signedIn={viewer.user !== null}
        planName={viewer.plan.name}
        historyDays={historyDays}
        historyTrimmed={historyTrimmed}
        trackingAllowance={viewer.plan.limits.trackedAccounts}
        isTracked={myTracked.includes(profile.username.toLowerCase())}
      />
      {dashboard}
    </div>
  );
}
