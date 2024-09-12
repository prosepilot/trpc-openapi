import { TRPCError } from '@trpc/server';

export const TRPC_ERROR_CODE_HTTP_STATUS: Record<TRPCError['code'], number> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TIMEOUT: 408,
  CONFLICT: 409,
  CLIENT_CLOSED_REQUEST: 499,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  UNSUPPORTED_MEDIA_TYPE: 415,
  METHOD_NOT_SUPPORTED: 405,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429
};

export const getErrorFromUnknown = (error: unknown): TRPCError => {
  if (error instanceof TRPCError) {
    return error;
  }
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error occurred',
  });
};