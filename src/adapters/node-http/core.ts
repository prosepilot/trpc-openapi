import { AnyProcedure, getErrorShape, TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import {
  NodeHTTPHandlerOptions,
  NodeHTTPRequest,
  NodeHTTPResponse,
} from '@trpc/server/dist/adapters/node-http';
import cloneDeep from 'lodash.clonedeep';
import { ZodError, z } from 'zod';

import { generateOpenApiDocument } from '../../generator';
import {
  OpenApiErrorResponse,
  OpenApiMethod,
  OpenApiResponse,
  OpenApiRouter,
  OpenApiSuccessResponse,
} from '../../types';
import { acceptsRequestBody } from '../../utils/method';
import { normalizePath } from '../../utils/path';
import { getInputOutputParsers } from '../../utils/procedure';
import {
  instanceofZodTypeArray,
  instanceofZodTypeCoercible,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  unwrapZodType,
  zodSupportsCoerce,
} from '../../utils/zod';
import { getErrorFromUnknown } from './errors';
import { getBody, getQuery } from './input';
import { createProcedureCache } from './procedures';
import { HTTPHeaders } from '@trpc/client';
import { TRPCRequestInfo } from '@trpc/server/dist/unstable-core-do-not-import/http/types';


export type CreateOpenApiNodeHttpHandlerOptions<
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = Pick<
  NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>,
  'router' | 'createContext' | 'responseMeta' | 'onError' | 'maxBodySize'
>;

export type OpenApiNextFunction = () => void;

function headersToRecord(headers: Headers | HTTPHeaders): Record<string, string> {
  const result: Record<string, string> = {};

  if (headers instanceof Headers) {
    // For Headers (fetch API style)
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else {
    // For HTTPHeaders (plain object style)
    Object.entries(headers).forEach(([key, value]) => {
      result[key] = String(value); // Ensure value is coerced to string
    });
  }

  return result;
}

export const createOpenApiNodeHttpHandler = <
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: CreateOpenApiNodeHttpHandlerOptions<TRouter, TRequest, TResponse>,
) => {
  const router = cloneDeep(opts.router);

  // Validate router
  if (process.env.NODE_ENV !== 'production') {
    generateOpenApiDocument(router, { title: '', version: '', baseUrl: '' });
  }

  const { createContext, responseMeta, onError, maxBodySize } = opts;
  const getProcedure = createProcedureCache(router);

  return async (req: TRequest, res: TResponse, next?: OpenApiNextFunction) => {
    const sendResponse = (
      statusCode: number,
      headers: Record<string, string>,
      body: OpenApiResponse | undefined,
    ) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== 'undefined') {
          res.setHeader(key, value);
        }
      }
      res.end(JSON.stringify(body));
    };

    const method = req.method! as OpenApiMethod & 'HEAD';
    const reqUrl = req.url!;
    const url = new URL(reqUrl.startsWith('/') ? `http://127.0.0.1${reqUrl}` : reqUrl);
    const path = normalizePath(url.pathname);
    const { procedure, pathInput } = getProcedure(method, path) ?? {};

    let input: any = undefined;
    let ctx: any = undefined;
    let data: any = undefined;

    try {
      if (!procedure) {
        if (next) {
          return next();
        }

        if (method === 'HEAD') {
          sendResponse(204, {}, undefined);
          return;
        }

        throw new TRPCError({
          message: 'Not found',
          code: 'NOT_FOUND',
        });
      }

      const useBody = acceptsRequestBody(method);
      const schema = getInputOutputParsers(procedure.procedure).inputParser as z.ZodTypeAny;
      const unwrappedSchema = unwrapZodType(schema, true);

      if (!instanceofZodTypeLikeVoid(unwrappedSchema)) {
        const bodyOrQuery = useBody ? await getBody(req, maxBodySize) : getQuery(req, url);
      
        if (instanceofZodTypeArray(unwrappedSchema)) {
          // Input schema is an array
          if (!Array.isArray(bodyOrQuery)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Expected array in request body',
            });
          }
          input = bodyOrQuery;
        } else {
          // Input schema is an object or other type
          input = {
            ...bodyOrQuery,
            ...pathInput,
          };
        }
      }

      if (zodSupportsCoerce) {
        if (instanceofZodTypeObject(unwrappedSchema)) {
          const shapeSchemas = Object.values(unwrappedSchema.shape);
          shapeSchemas.forEach((shapeSchema) => {
            const unwrappedShapeSchema = unwrapZodType(shapeSchema, false);
            if (instanceofZodTypeCoercible(unwrappedShapeSchema)) {
              unwrappedShapeSchema._def.coerce = true;
            }
          });
        } else if (instanceofZodTypeArray(unwrappedSchema)) {
          // Handle coercion for array items
          const itemSchema = unwrappedSchema._def.type;
          const unwrappedItemSchema = unwrapZodType(itemSchema, false);
          if (instanceofZodTypeCoercible(unwrappedItemSchema)) {
            unwrappedItemSchema._def.coerce = true;
          }
        }
      }

      ctx = await createContext?.({
        req,
        res,
        info: {} as TRPCRequestInfo,  // Ensure TRPCRequestInfo is provided
      });

      const caller = router.createCaller(ctx);
      const segments = procedure?.path.split('.') ?? [];
      const procedureFn = segments.reduce((acc: any, curr: string) => acc[curr], caller) as AnyProcedure | undefined;

      if (!procedureFn) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Procedure not found',
        });
      }

      data = await procedureFn(input);

      const meta = responseMeta?.({
        type: procedure.type,
        paths: [procedure.path],
        ctx,
        data: [data],
        errors: [],
        info: {} as TRPCRequestInfo,  // Provide TRPCRequestInfo
        eagerGeneration: false,  // Set eagerGeneration flag
      });

      const statusCode = meta?.status ?? 200;
      const headers = meta?.headers ?? {};
      const body: OpenApiSuccessResponse<typeof data> = data;
      sendResponse(statusCode, headersToRecord(headers), body);
    } catch (cause) {
      const error = getErrorFromUnknown(cause);

      onError?.({
        error,
        type: procedure?.type ?? 'unknown',
        path: procedure?.path,
        input,
        ctx,
        req,
      });

      const meta = responseMeta?.({
        type: procedure?.type ?? 'unknown',
        paths: procedure?.path ? [procedure?.path] : undefined,
        ctx,
        data: [data],
        errors: [error],
        eagerGeneration: false,
        info: {} as TRPCRequestInfo,  // Ensure TRPCRequestInfo is provided
      });

      const errorShape = getErrorShape({
        config: opts.router._def._config,
        error,
        type: 'unknown',
        path,
        input: undefined,
        ctx: undefined,
      }) ?? {
        message: error.message ?? 'An error occurred',
        code: error.code,
      };

      const isInputValidationError =
        error.code === 'BAD_REQUEST' &&
        error.cause instanceof Error &&
        error.cause.name === 'ZodError';

      const statusCode = meta?.status ?? getHTTPStatusCodeFromError(error) ?? 500;
      const headers = meta?.headers ?? {};
      const body: OpenApiErrorResponse = {
        message: isInputValidationError
          ? 'Input validation failed'
          : errorShape?.message ?? error.message ?? 'An error occurred',
        code: error.code,
        issues: isInputValidationError ? (error.cause as ZodError).errors : undefined,
      };
      sendResponse(statusCode, headersToRecord(headers), body);
    }
  };
};