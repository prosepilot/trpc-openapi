import { TRPCError } from '@trpc/server';
import { FetchHandlerOptions } from '@trpc/server/adapters/fetch';
import { IncomingMessage, ServerResponse } from 'http';

import { OpenApiRouter } from '../types';
import {
  CreateOpenApiNodeHttpHandlerOptions,
  createOpenApiNodeHttpHandler,
} from './node-http/core';

export type CreateOpenApiFetchHandlerOptions<TRouter extends OpenApiRouter> = Omit<
  FetchHandlerOptions<TRouter>,
  'batching'
> & {
  req: Request;
  endpoint: `/${string}`;
};

const getUrlEncodedBody = async (req: Request) => {
  const params = new URLSearchParams(await req.text());

  const data: Record<string, unknown> = {};

  for (const key of params.keys()) {
    data[key] = params.getAll(key);
  }

  return data;
};

// co-body does not parse Request body correctly
const getRequestBody = async (req: Request) => {
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      return {
        isValid: true,
        // use JSON.parse instead of req.json() because req.json() does not throw on invalid JSON
        data: JSON.parse(await req.text()),
      };
    }

    if (req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      return {
        isValid: true,
        data: await getUrlEncodedBody(req),
      };
    }

    return {
      isValid: true,
      data: req.body,
    };
  } catch (err) {
    return {
      isValid: false,
      cause: err,
    };
  }
};

const createRequestProxy = async (req: Request, url?: string) => {
  const body = await getRequestBody(req);

  return new Proxy(req, {
    get: (target, prop) => {
      if (prop === 'url') {
        return url ? url : target.url;
      }

      if (prop === 'headers') {
        return new Proxy(target.headers, {
          get: (target, prop) => {
            return target.get(prop.toString());
          },
        });
      }

      if (prop === 'body') {
        if (!body.isValid) {
          throw new TRPCError({
            code: 'PARSE_ERROR',
            message: 'Failed to parse request body',
            cause: body.cause,
          });
        }

        return body.data;
      }

      return target[prop as keyof typeof target];
    },
  });
};

export const createOpenApiFetchHandler = async <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiFetchHandlerOptions<TRouter>,
): Promise<Response> => {
  const resHeaders = new Headers();
  const url = new URL(opts.req.url.replace(opts.endpoint, ''));
  const req: Request = await createRequestProxy(opts.req, url.toString());

  const createContext = () => {
    if (opts.createContext) {
      return opts.createContext({ req: opts.req, resHeaders });
    }
    return () => ({});
  };

  const openApiHttpHandler = createOpenApiNodeHttpHandler({
    router: opts.router,
    createContext,
    onError: opts.onError,
    responseMeta: opts.responseMeta,
  } as CreateOpenApiNodeHttpHandlerOptions<TRouter, any, any>);

  return new Promise<Response>((resolve) => {
    let statusCode: number | undefined;

    return openApiHttpHandler(
      req as unknown as IncomingMessage,

      {
        setHeader: (key: string, value: string | readonly string[]) => {
          if (typeof value === 'string') {
            resHeaders.set(key, value);
          } else {
            for (const v of value) {
              resHeaders.append(key, v);
            }
          }
        },
        get statusCode() {
          return statusCode;
        },
        set statusCode(code: number | undefined) {
          statusCode = code;
        },
        end: (body: string) => {
          resolve(
            new Response(body, {
              headers: resHeaders,
              status: statusCode,
            }),
          );
        },
      } as unknown as ServerResponse,
    );
  });
};
