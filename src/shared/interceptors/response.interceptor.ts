import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse } from '../types/api-response.type';

type ApiResponseResult<T> = ApiResponse<T> | undefined;

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponseResult<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseResult<T>> {
    return next.handle().pipe(
      map<T, ApiResponseResult<T>>((result) => {
        if (result === undefined) {
          return undefined;
        }

        if (this.isApiResponse<T>(result)) {
          return result;
        }

        return {
          data: result,
        };
      }),
    );
  }

  private isApiResponse<T>(value: unknown): value is ApiResponse<T> {
    return typeof value === 'object' && value !== null && 'data' in value;
  }
}
