import {
  ApiListResponse,
  ApiMeta,
  ApiResponse,
} from '../types/api-response.type';

export function createApiResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
  };
}

export function createApiListResponse<T>(
  data: T[],
  meta: ApiMeta,
): ApiListResponse<T> {
  return {
    data,
    meta,
  };
}
