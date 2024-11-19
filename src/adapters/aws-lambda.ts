import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context as APIGWContext } from 'aws-lambda';
import * as querystring from 'querystring';
import { EventEmitter } from 'events';
import type { RequestMethod } from 'node-mocks-http';
import { createRequest, createResponse } from 'node-mocks-http';
import { getErrorShape, TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { LambdaEvent } from '@trpc/server/dist/adapters/aws-lambda/getPlanner';

import type { CreateOpenApiAwsLambdaHandlerOptions, OpenApiErrorResponse, OpenApiRouter } from '../types';
import { createOpenApiNodeHttpHandler } from './node-http/core';
import { getErrorFromUnknown } from './node-http/errors';
import { TRPCRequestInfo } from '@trpc/server/dist/unstable-core-do-not-import/http/types';

// Assume payload format is determined by inspecting version directly in the event
function determinePayloadFormat(event: LambdaEvent): string {
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  // According to AWS support, version is is extracted from the version property in the event.
  // If there is no version property, then the version is implied as 1.0
  const unknownEvent = event as { version?: string };
  if (typeof unknownEvent.version === 'undefined') {
    return '1.0';
  } else {
    return unknownEvent.version;
  }
}
// Create simplified mock for the Lambda event
const createMockNodeHTTPRequest = (path: string, event: APIGatewayProxyEvent| APIGatewayProxyEventV2) => {
  const url = (event as APIGatewayProxyEvent).path || (event as APIGatewayProxyEventV2).rawPath ||  '/';

  const method = ((event as APIGatewayProxyEvent).httpMethod || (event as APIGatewayProxyEventV2).requestContext.http.method || 'GET').toUpperCase() as RequestMethod;

  let body;
  const contentType =
    event.headers[
      Object.keys(event.headers).find((key) => key.toLowerCase() === 'content-type') ?? ''
    ];
  if (contentType === 'application/json') {
    try {
      body = event.body ? JSON.parse(event.body) : undefined;
    } catch (cause) {
      throw new TRPCError({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
        cause,
      });
    }
  } else if(contentType === 'application/x-www-form-urlencoded'){
    try {
      // Parse URL-encoded form data
      body = event.body ? querystring.parse(event.body) : undefined;
    } catch (cause) {
      throw new TRPCError({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
        cause,
      });
    }
  }

  return createRequest({
    url,
    method,
    query: event.queryStringParameters || undefined,
    headers: event.headers,
    body,
  });
};

const createMockNodeHTTPResponse = () => {
  return createResponse({ eventEmitter: EventEmitter });
};

export const createOpenApiAwsLambdaHandler = <
  TRouter extends OpenApiRouter,
  TEvent extends APIGatewayProxyEvent | APIGatewayProxyEventV2,
>(
  opts: CreateOpenApiAwsLambdaHandlerOptions<TRouter, TEvent>,
) => {
  return async (event: TEvent, context: APIGWContext) => {
    let path: string | undefined;
    try {
      const version = determinePayloadFormat(event);

      if (version !== '1.0' && version !== '2.0') {
        throw new TRPCError({
          message: `Unsupported payload format version: ${version}`,
          code: 'INTERNAL_SERVER_ERROR',
        });
      }

      const createContext = async () => opts.createContext?.({
        event,
        context,
        info: {} as TRPCRequestInfo, // Ensure 'info' is provided
      });

      const openApiHttpHandler = createOpenApiNodeHttpHandler({ ...opts, createContext } as any);

      // Assume we can directly use the event path or default
      path = (event as APIGatewayProxyEvent).path || (event as APIGatewayProxyEventV2).rawPath ||  '/';

      const req = createMockNodeHTTPRequest(path, event);
      const res = createMockNodeHTTPResponse();

      await openApiHttpHandler(req, res);

      return {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: res._getData(),
      };
    } catch (cause) {
      const error = getErrorFromUnknown(cause);

      opts.onError?.({
        error,
        type: 'unknown',
        path,
        input: undefined,
        ctx: undefined,
        req: event,
      });

      const meta = opts.responseMeta?.({
        type: 'unknown' as const,
        paths: [path as unknown as string],
        ctx: undefined,
        data: [undefined as unknown as any],
        errors: [error],
        info: {} as TRPCRequestInfo,  // Provide a valid TRPCRequestInfo
        eagerGeneration: false,       // Set the eagerGeneration flag
      });
      
      const errorShape = getErrorShape({
        config: opts.router._def._config,
        error,
        type: 'unknown',
        path,
        input: undefined,
        ctx: undefined,
      });

      const statusCode = meta?.status ?? getHTTPStatusCodeFromError(error) ?? 500;
      const headers = { 'content-type': 'application/json', ...(meta?.headers ?? {}) };
      const body: OpenApiErrorResponse = {
        message: errorShape?.message ?? error.message ?? 'An error occurred',
        code: error.code,
      };

      return {
        statusCode,
        headers,
        body: JSON.stringify(body),
      };
    }
  };
};