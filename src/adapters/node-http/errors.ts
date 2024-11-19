import { TRPCError } from '@trpc/server';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';

export const getErrorFromUnknown = (error: unknown): TRPCError => {
  if (error instanceof Error && error.name === 'TRPCError') {
    return error as TRPCError;
  }

  const code = (error as any).code as keyof typeof TRPC_ERROR_CODES_BY_KEY;
  const errorToString =
    typeof (error as any).toString === 'function' ? (error as any).toString() : undefined;
  return new TRPCError({
    code: TRPC_ERROR_CODES_BY_KEY[code] ? code : 'INTERNAL_SERVER_ERROR',
    message:
      error instanceof Error
        ? error.message
        : errorToString
        ? errorToString
        : 'Unknown error occurred',
  });
};