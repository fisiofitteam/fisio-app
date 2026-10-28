// Eligibility for the person assigned to a sales-call calendar slot.
export function canCoverClosingShift(person: { role: string; extraRoles?: string[] | null }): boolean {
  return [person.role, ...(person.extraRoles ?? [])].some(role => ["ceo", "closer", "setter"].includes(role));
}
