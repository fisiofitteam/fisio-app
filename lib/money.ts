/** Round decimal half-cents away from zero, including negative adjustments. */
export function moneyCents(value: number): number {
  const scaled = Math.abs(value) * 100;
  // Account for Float representations such as 1.005 * 100 = 100.49999… .
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled));
  return value < 0 ? -rounded : rounded;
}

export const roundMoney = (value: number): number => moneyCents(value) / 100;
