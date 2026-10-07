/**
 * Standard HTTP methods used across the application.
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

/**
 * Standard HTTP status codes used across the application.
 * Uses const enum for zero runtime overhead (values are inlined).
 */
export const enum HttpStatusCode {
  // Success
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,

  // Client errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  PAYLOAD_TOO_LARGE = 413,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // Server errors
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  INSUFFICIENT_STORAGE = 507,
}

/**
 * Standard HTTP headers for JSON content type.
 */
export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
