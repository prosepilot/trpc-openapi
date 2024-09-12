import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { OpenAPIV3 } from 'openapi-types';
import { ZodIssue } from 'zod';
import { TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc';
import { AWSLambdaOptions } from '@trpc/server/adapters/aws-lambda';
import { ProcedureBuilder } from '@trpc/server/dist/unstable-core-do-not-import/procedureBuilder';
import { Router, RouterRecord } from '@trpc/server/dist/unstable-core-do-not-import/router';
import { AnyRootTypes, CreateRootTypes } from '@trpc/server/dist/unstable-core-do-not-import/rootConfig';
import { AnyProcedure } from '@trpc/server/dist/unstable-core-do-not-import/procedure';

export type CreateOpenApiAwsLambdaHandlerOptions<
  TRouter extends OpenApiRouter,
  TEvent extends APIGatewayProxyEvent | APIGatewayProxyEventV2,
> = Pick<
  AWSLambdaOptions<TRouter, TEvent>,
  'router' | 'createContext' | 'responseMeta' | 'onError'
>;

export type OpenApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type TRPCMeta = Record<string, unknown>;

export type OpenApiContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | (string & {});

export type OpenApiMeta<TMeta = TRPCMeta> = TMeta & {
  openapi?: {
    enabled?: boolean;
    method: OpenApiMethod;
    path: `/${string}`;
    summary?: string;
    description?: string;
    protect?: boolean;
    tags?: string[];
    headers?: (OpenAPIV3.ParameterBaseObject & { name: string; in?: 'header' })[];
    contentTypes?: OpenApiContentType[];
    deprecated?: boolean;
    example?: {
      request?: Record<string, any>;
      response?: Record<string, any>;
    };
    responseHeaders?: Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject>;
  };
};
export type OpenApiProcedure<TMeta = TRPCMeta> = ProcedureBuilder<any, TMeta, any, any, any, any, any, any>;

export type OpenApiProcedureRecord<TMeta = TRPCMeta> = {
  [key: string]: AnyProcedure | RouterRecord;
};
export type OpenApiRouter<
  TMeta = TRPCMeta,
  TRoot extends AnyRootTypes = CreateRootTypes<{
    ctx: any;
    meta: OpenApiMeta<TMeta>;
    errorShape: any;
    transformer: any;
  }>,
  TDef extends RouterRecord = OpenApiProcedureRecord<TMeta>,
> = Router<TRoot, TDef>;

export type OpenApiSuccessResponse<D = any> = D;

export type OpenApiErrorResponse = {
  message: string;
  code: TRPC_ERROR_CODE_KEY;
  issues?: ZodIssue[];
};

export type OpenApiResponse<D = any> = OpenApiSuccessResponse<D> | OpenApiErrorResponse;