import { SQL, sql } from 'drizzle-orm';

export function applyPagination(page: number, limit: number) {
  const offset = (page - 1) * limit;
  return { limit, offset };
}

export function calcTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}
