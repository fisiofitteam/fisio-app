type AssessmentHistoryItem = {
  date: Date;
  completedAt?: Date | null;
  hasDelivery?: boolean;
};

const madridDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
});

/** A scheduled day is still current, even before that day's session time. */
export function isUpcomingAssessment(item: AssessmentHistoryItem, now = new Date()) {
  return !item.completedAt && !item.hasDelivery &&
    madridDay.format(item.date) > madridDay.format(now);
}

export function partitionAssessmentHistory<T extends AssessmentHistoryItem>(items: T[], now = new Date()) {
  const current: T[] = [];
  const upcoming: T[] = [];
  for (const item of items) {
    (isUpcomingAssessment(item, now) ? upcoming : current).push(item);
  }
  current.sort((a, b) => b.date.getTime() - a.date.getTime());
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { current, upcoming };
}
