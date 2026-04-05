export function computeNextRun(frequency: string): Date {
  const now = new Date();
  if (frequency === 'daily') {
    now.setDate(now.getDate() + 1);
    now.setHours(8, 0, 0, 0);
  } else if (frequency === 'weekly') {
    now.setDate(now.getDate() + (7 - now.getDay() + 1));
    now.setHours(8, 0, 0, 0);
  } else {
    now.setMonth(now.getMonth() + 1, 1);
    now.setHours(8, 0, 0, 0);
  }
  return now;
}

export function getReportDateRange(frequency: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  if (frequency === 'daily') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: yesterday.toISOString().slice(0, 10), to };
  }
  if (frequency === 'weekly') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { from: weekAgo.toISOString().slice(0, 10), to };
  }
  // monthly — last calendar month
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThisMonth);
  lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  return {
    from: lastMonthStart.toISOString().slice(0, 10),
    to: lastMonthEnd.toISOString().slice(0, 10),
  };
}
