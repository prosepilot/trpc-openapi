import { TRPCError, inferRouterContext } from '@trpc/server';
import { NodeHTTPRequest } from '@trpc/server/dist/adapters/node-http';
import { ResponseMetaFn } from '@trpc/server/dist/http/internals/types';
import { OnErrorFunction } from '@trpc/server/dist/internals/types';
import EventEmitter from 'events';
// Unfortunately the index of node-mocks-http imports its express mocks, which
// use the `depd` package to mark a function as deprecated, which internally
// uses eval(), which @edge-runtime/jest-environment (rightly) forbids.
// So we have to import it directly. Typing it requires the `fetch.d.ts` hack.
import { createRequest } from 'node-mocks-http/lib/mockRequest';
import { createResponse } from 'node-mocks-http/lib/mockResponse';

import { generateOpenApiDocument } from '../generator';
import { OpenApiErrorResponse, OpenApiMethod, OpenApiRouter } from '../types';
import { createOpenApiNodeHttpHandler } from './node-http/core';
import { TRPC_ERROR_CODE_HTTP_STATUS, getErrorFromUnknown } from './node-http/errors';

export type CreateFetchContextFn<TRouter extends OpenApiRouter> = (params: {
  req: Request;
  resHeaders: Headers;
}) => inferRouterContext<TRouter>;

export interface CreateOpenApiFetchHandlerOpts<TRouter extends OpenApiRouter> {
  router: TRouter;
  endpoint: string;
  createContext?: CreateFetchContextFn<TRouter>;
  onError?: OnErrorFunction<TRouter, Request>;
  responseMeta?: ResponseMetaFn<TRouter>;
}

const createMockNodeHTTPRequest = async (srcReq: Request, url: URL): Promise<NodeHTTPRequest> => {
  const method = srcReq.method as OpenApiMethod & 'HEAD';

  let body = undefined;
  const contentType = srcReq.headers.get('content-type');
  if (contentType === 'application/json') {
    try {
      if (srcReq.body) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body = await srcReq.json();
      }
    } catch (cause) {
      throw new TRPCError({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
        cause,
      });
    }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    try {
      if (srcReq.body) {
        const searchParamsString = await srcReq.text();
        const searchParams = new URLSearchParams(searchParamsString);
        body = {} as Record<string, unknown>;
        for (const [key, value] of searchParams.entries()) {
          body[key] = value;
        }
      }
    } catch (cause) {
      throw new TRPCError({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
        cause,
      });
    }
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of srcReq.headers.entries()) {
    headers[key] = value;
  }

  return createRequest({
    url: url.toString(),
    method,
    query: url.searchParams,
    headers,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    body,
  });
};

export function createOpenApiFetchHandler<TRouter extends OpenApiRouter>(
  opts: CreateOpenApiFetchHandlerOpts<TRouter>,
) {
  // Validate router
  if (process.env.NODE_ENV !== 'production') {
    generateOpenApiDocument(opts.router, { title: '', version: '', baseUrl: '' });
  }
  return async (srcReq: Request): Promise<Response> => {
    const resHeaders = new Headers();

    const createContext = () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return opts.createContext?.({ req: srcReq, resHeaders });
    };

    const url = new URL(srcReq.url.startsWith('/') ? `http://127.0.0.1${srcReq.url}` : srcReq.url);
    url.pathname = url.pathname.slice(opts.endpoint.length + 1);

    try {
      const req = await createMockNodeHTTPRequest(srcReq, url);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const openApiHttpHandler = createOpenApiNodeHttpHandler({ ...opts, createContext } as any);

      const res = createResponse({ eventEmitter: EventEmitter });

      await openApiHttpHandler(req, res);

      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v) {
          if (Array.isArray(v)) {
            for (const value of v) {
              resHeaders.append(k, value);
            }
          } else {
            resHeaders.append(k, typeof v === 'number' ? v.toString(10) : v);
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return new Response(res._getData(), {
        status: res.statusCode,
        headers: resHeaders,
      });
    } catch (err) {
      const error = getErrorFromUnknown(err);
      opts.onError?.({
        error,
        type: 'unknown',
        path: url.pathname,
        input: undefined,
        ctx: undefined,
        req: srcReq,
      });

      const meta = opts.responseMeta?.({
        type: 'unknown',
        paths: [url.pathname],
        ctx: undefined,
        data: [undefined as unknown as any],
        errors: [error],
      });

      const errorShape = opts.router.getErrorShape({
        error,
        type: 'unknown',
        path: url.pathname,
        input: undefined,
        ctx: undefined,
      });

      const statusCode = meta?.status ?? TRPC_ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
      const headers = new Headers({ 'content-type': 'application/json', ...(meta?.headers ?? {}) });
      const body: OpenApiErrorResponse = {
        message: errorShape?.message ?? error.message ?? 'An error occurred',
        code: error.code,
      };

      return new Response(JSON.stringify(body), {
        status: statusCode,
        headers,
      });
    }
  };
}
