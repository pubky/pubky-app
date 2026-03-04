import { NextResponse } from 'next/server';
import { AppError, ErrorService, toAppError } from '../error';
import { HttpStatusCode } from '../http';

interface HandleApiErrorOptions {
  unknownErrorMessage?: string;
}

function getApiErrorStatusCode(error: AppError): number {
  const statusCode = error.context?.statusCode;
  return typeof statusCode === 'number' ? statusCode : HttpStatusCode.INTERNAL_SERVER_ERROR;
}

export function handleApiError(error: unknown, operation: string, options: HandleApiErrorOptions = {}): NextResponse {
  const isAppError = error instanceof AppError;
  const appError = isAppError ? error : toAppError(error, ErrorService.Local, operation);
  const message = isAppError ? appError.message : (options.unknownErrorMessage ?? 'Internal Server Error');

  return NextResponse.json({ error: message }, { status: getApiErrorStatusCode(appError) });
}
