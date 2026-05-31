import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'message' in errorResponse
        ? errorResponse.message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const error =
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'error' in errorResponse
        ? errorResponse.error
        : this.getDefaultError(statusCode);

    response.status(statusCode).json({
      statusCode,
      error,
      message,
    });
  }

  private getDefaultError(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'Bad Request';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 500:
        return 'Internal Server Error';
      default:
        return 'Error';
    }
  }
}
