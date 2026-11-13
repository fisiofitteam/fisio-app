// Only explicitly preparatory periods are excluded. Historic paid programs can have no
// amount recorded, so a zero or missing amount cannot classify a period on its own.
export const preparatoryStatuses = ["assessment_only", "reserved"];
export const programPeriodWhere = { isReservation: false, status: { notIn: preparatoryStatuses } };
export const isProgramPeriod = (row: { isReservation: boolean; status?: string }) =>
  !row.isReservation && !preparatoryStatuses.includes(row.status ?? "");
