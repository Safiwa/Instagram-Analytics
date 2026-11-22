import type { CreatorProfile } from "../data/types";
import type { PeerMatch, PeerRanking, PeerRankingRow } from "./peer";
import type { RegionalPeer, RegionalRanking, RegionalRankRow } from "./regional";

// These curated accounts cover a very similar UAE lifestyle niche. Showing both
// in the same benchmark set makes the profile page look repetitive, so at most
// one of them is kept on any searched profile page.
const EXCLUSIVE_PEER_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["ola.alqodmani", "trending.vibz.uae"]),
];

type Candidate = { profile: CreatorProfile; score: number };
type RankRow = { profile: CreatorProfile; isTarget: boolean; rankScore: number };
type RankLike<T extends RankRow> = {
  rows: T[];
  targetRank: number;
  total: number;
  outperformedPercent: number | null;
};

export type ProfileBenchmarks = {
  peer: PeerMatch | null;
  ranking: PeerRanking | null;
  regionalPeer: RegionalPeer | null;
  regionalRanking: RegionalRanking | null;
};

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

function groupKey(group: ReadonlySet<string>): string {
  return [...group].sort().join("|");
}

function excludedHandles(candidates: Candidate[], targets: ReadonlySet<string>): Set<string> {
  const groups = new Map<
    string,
    { group: ReadonlySet<string>; best: Candidate | null }
  >();
  for (const group of EXCLUSIVE_PEER_GROUPS) {
    groups.set(groupKey(group), { group, best: null });
  }

  const excluded = new Set<string>();

  // When the searched profile itself belongs to an exclusive group, it is the
  // row we must keep. Every other member is a duplicate on that page, even if
  // it scored better as a candidate peer.
  for (const group of EXCLUSIVE_PEER_GROUPS) {
    const targetMember = [...group].find((member) => targets.has(member));
    if (!targetMember) {
      continue;
    }
    for (const member of group) {
      if (member !== targetMember) {
        excluded.add(member);
      }
    }
  }

  for (const candidate of candidates) {
    const username = normalize(candidate.profile.username);
    const group = EXCLUSIVE_PEER_GROUPS.find((entry) => entry.has(username));
    if (!group || excluded.has(username)) {
      continue;
    }
    const current = groups.get(groupKey(group));
    if (!current) {
      continue;
    }
    const bestUsername = current.best ? normalize(current.best.profile.username) : "";
    if (
      !current.best ||
      candidate.score > current.best.score ||
      (candidate.score === current.best.score && username < bestUsername)
    ) {
      current.best = candidate;
    }
  }

  for (const { group, best } of groups.values()) {
    if (!best) {
      continue;
    }
    const keep = normalize(best.profile.username);
    for (const member of group) {
      if (member !== keep) {
        excluded.add(member);
      }
    }
  }
  return excluded;
}

function filterRanking<T extends RankRow>(
  ranking: RankLike<T>,
  excluded: Set<string>,
): RankLike<T> {
  const rows = ranking.rows.filter(
    (row) => row.isTarget || !excluded.has(normalize(row.profile.username)),
  );
  const target = rows.find((row) => row.isTarget);
  const peers = rows.filter((row) => !row.isTarget);
  const beaten = target ? peers.filter((peer) => peer.rankScore < target.rankScore).length : 0;

  return {
    ...ranking,
    rows,
    total: rows.length,
    targetRank: Math.max(1, rows.findIndex((row) => row.isTarget) + 1),
    outperformedPercent:
      peers.length > 0 ? Math.round((beaten / peers.length) * 100) : null,
  };
}

// Applies the exclusivity rule after all four benchmark surfaces are built, so
// the closest-peer card, both ranking tables and the regional comparison never
// disagree by keeping a different member of the same group.
export function dedupeProfileBenchmarks(input: ProfileBenchmarks): ProfileBenchmarks {
  const candidates: Candidate[] = [
    ...(input.peer ? [{ profile: input.peer.profile, score: input.peer.score }] : []),
    ...(input.ranking?.rows ?? [])
      .filter((row: PeerRankingRow) => !row.isTarget)
      .map((row: PeerRankingRow) => ({
        profile: row.profile,
        score: row.matchScore ?? row.rankScore,
      })),
    ...(input.regionalPeer
      ? [{ profile: input.regionalPeer.profile, score: input.regionalPeer.matchScore }]
      : []),
    ...(input.regionalRanking?.rows ?? [])
      .filter((row: RegionalRankRow) => !row.isTarget)
      .map((row: RegionalRankRow) => ({
        profile: row.profile,
        score: row.matchScore ?? row.rankScore,
      })),
  ];

  const targets = new Set(
    [
      ...(input.ranking?.rows ?? []),
      ...(input.regionalRanking?.rows ?? []),
    ]
      .filter((row) => row.isTarget)
      .map((row) => normalize(row.profile.username)),
  );
  const excluded = excludedHandles(candidates, targets);
  if (excluded.size === 0) {
    return input;
  }

  return {
    peer: input.peer && !excluded.has(normalize(input.peer.profile.username)) ? input.peer : null,
    ranking: input.ranking ? filterRanking(input.ranking, excluded) : null,
    regionalPeer:
      input.regionalPeer && !excluded.has(normalize(input.regionalPeer.profile.username))
        ? input.regionalPeer
        : null,
    regionalRanking: input.regionalRanking
      ? filterRanking(input.regionalRanking, excluded)
      : null,
  };
}
