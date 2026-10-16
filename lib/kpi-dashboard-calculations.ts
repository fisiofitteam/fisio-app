/** Pure, read-only projections used by the KPI dashboard. */
export type LeadCounts = {
  scheduled: number;
  done: number;
  won: number;
  lost: number;
  noShow: number;
  cancelled: number;
  pending: number;
  showRate: number | null;
  closeRate: number | null;
};

export type SourceBreakdown = LeadCounts & { id: string; label: string };

export function countLeadOutcomes(statuses: readonly string[]): LeadCounts {
  const won = statuses.filter((status) => status === "won").length;
  const lost = statuses.filter((status) => status === "lost").length;
  const noShow = statuses.filter((status) => status === "no_show").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  const done = won + lost;
  const percent = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : null;
  return {
    scheduled: statuses.length, done, won, lost, noShow, cancelled,
    pending: statuses.length - done - noShow - cancelled,
    showRate: percent(done, done + noShow),
    closeRate: percent(won, done),
  };
}

export function groupLeadOutcomes(
  leads: readonly { status: string; groupId: string; groupLabel: string }[],
): SourceBreakdown[] {
  const groups = new Map<string, { label: string; statuses: string[] }>();
  for (const lead of leads) {
    const group = groups.get(lead.groupId) ?? { label: lead.groupLabel, statuses: [] };
    group.statuses.push(lead.status);
    groups.set(lead.groupId, group);
  }
  return [...groups].map(([id, group]) => ({ id, label: group.label, ...countLeadOutcomes(group.statuses) }))
    .sort((a, b) => b.scheduled - a.scheduled || a.label.localeCompare(b.label, "es"));
}

export type SubscriptionInterval = { patientId: string; startDate: Date | null; endDate: Date | null };
export type IntervalHealth = {
  activeAtStart: number | null;
  activeAtEnd: number | null;
  additions: number | null;
  departures: number | null;
  churnRate: number | null;
  averageActive: number | null;
  incompleteIntervals: number;
};

/**
 * Reconstruct two snapshots from the dates currently stored in subscription
 * history. Each patient counts once, even if periods overlap. These are net
 * cohort movements between snapshots, not all starts/ends during the period.
 * Subscription end is exclusive, matching the app's active endDate > now rule.
 * Pauses and historical edits cannot be reconstructed from these dates.
 */
export function reconstructIntervalHealth(
  intervals: readonly SubscriptionInterval[], start: Date, end: Date, now: Date,
): IntervalHealth {
  const from = start.getTime();
  const to = Math.min(end.getTime(), now.getTime());
  const incompleteIntervals = intervals.filter((row) => !row.startDate || !row.endDate ||
    row.endDate.getTime() <= row.startDate.getTime()).length;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || intervals.length === incompleteIntervals) {
    return { activeAtStart: null, activeAtEnd: null, additions: null, departures: null,
      churnRate: null, averageActive: null, incompleteIntervals };
  }
  const atStart = new Set<string>();
  const atEnd = new Set<string>();
  for (const interval of intervals) {
    if (!interval.startDate || !interval.endDate) continue;
    const a = interval.startDate.getTime();
    const b = interval.endDate.getTime();
    if (b <= a) continue;
    if (a <= from && b > from) atStart.add(interval.patientId);
    if (a <= to && b > to) atEnd.add(interval.patientId);
  }
  const additions = [...atEnd].filter((id) => !atStart.has(id)).length;
  const departures = [...atStart].filter((id) => !atEnd.has(id)).length;
  return {
    activeAtStart: atStart.size, activeAtEnd: atEnd.size, additions, departures,
    churnRate: atStart.size > 0 ? Math.round(departures / atStart.size * 1000) / 10 : null,
    averageActive: (atStart.size + atEnd.size) / 2,
    incompleteIntervals,
  };
}
