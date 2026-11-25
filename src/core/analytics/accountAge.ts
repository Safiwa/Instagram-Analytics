// Instagram publishes no join date outside the logged-in app's "About this
// account" sheet. Account ids (the numeric "pk") are issued in rising order,
// so an id places an account roughly in time. These anchors are approximate
// first-ids-of-the-year and the result is always labelled as an estimate. It
// is a soft benchmark criterion, never a filter.
const JOIN_YEAR_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 2010],
  [2.0e7, 2011],
  [2.5e8, 2012],
  [5.5e8, 2013],
  [1.4e9, 2014],
  [2.0e9, 2015],
  [3.0e9, 2016],
  [5.0e9, 2017],
  [7.0e9, 2018],
  [1.2e10, 2019],
  [2.5e10, 2020],
  [4.4e10, 2021],
  [5.0e10, 2022],
  [5.7e10, 2023],
  [6.4e10, 2024],
  [7.0e10, 2025],
  [7.6e10, 2026],
];

function numericId(id: string | undefined): number | null {
  if (!id || !/^[0-9]{1,25}$/.test(id)) {
    return null;
  }
  const value = Number(id);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function estimateJoinYear(id: string | undefined): number | null {
  const value = numericId(id);
  if (value === null) {
    return null;
  }
  let year = JOIN_YEAR_ANCHORS[0][1];
  for (const [threshold, anchorYear] of JOIN_YEAR_ANCHORS) {
    if (value >= threshold) {
      year = anchorYear;
    }
  }
  return year;
}

export function joinYearLabel(id: string | undefined): string | null {
  const year = estimateJoinYear(id);
  return year === null ? null : `Joined ~${year} (est.)`;
}

// 100 for the same estimated year, minus 25 points per year apart. Null when
// either side has no id, so callers can leave the criterion out entirely.
export function joinDateSimilarity(
  left: string | undefined,
  right: string | undefined,
): number | null {
  const a = estimateJoinYear(left);
  const b = estimateJoinYear(right);
  if (a === null || b === null) {
    return null;
  }
  return Math.max(0, 100 - Math.abs(a - b) * 25);
}
