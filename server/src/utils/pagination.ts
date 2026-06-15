export interface PaginationQuery {
  page?: string | number;
  page_size?: string | number;
}

const positiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const parsePagination = (query: PaginationQuery, defaultPageSize = 50, maxPageSize = 100) => {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(positiveInteger(query.page_size, defaultPageSize), maxPageSize);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
};

export const paginationMeta = (page: number, pageSize: number, returned: number) => ({
  page,
  page_size: pageSize,
  has_more: returned === pageSize,
});
