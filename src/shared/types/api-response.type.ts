export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ApiMeta;
}
