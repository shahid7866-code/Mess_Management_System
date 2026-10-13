import "server-only";

export function fullCalendarMonthsBilled(startDate: Date, endDate: Date): number {
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new RangeError("A valid exclusive subscription interval is required");
  }

  const lastIncludedDay = new Date(endDate.getTime() - 1);
  return (
    (lastIncludedDay.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    lastIncludedDay.getUTCMonth() -
    startDate.getUTCMonth() +
    1
  );
}

export function subscriptionChargePaise(input: {
  startDate: Date;
  endDate: Date;
  monthlyAmountPaise: number;
}): number {
  if (!Number.isSafeInteger(input.monthlyAmountPaise) || input.monthlyAmountPaise < 1) {
    throw new RangeError("Monthly price must be a positive integer number of paise");
  }

  const total = fullCalendarMonthsBilled(input.startDate, input.endDate) * input.monthlyAmountPaise;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Subscription charge exceeds the safe integer range");
  }
  return total;
}