import { TRPCError } from '@trpc/server';
import { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import { OpenApiContentType } from '../types';
import {
  instanceofZodType,
  instanceofZodTypeCoercible,
  instanceofZodTypeLikeString,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  instanceofZodTypeOptional,
  unwrapZodType,
  zodSupportsCoerce,
} from '../utils/zod';

const zodSchemaToOpenApiSchemaObject = (zodSchema: z.ZodType): OpenAPIV3.SchemaObject => {
  // FIXME: https://github.com/StefanTerdell/zod-to-json-schema/issues/35
  return zodToJsonSchema(zodSchema, { target: 'openApi3', $refStrategy: 'none' }) as any;
};

export const getParameterObjects = (
  schema: unknown,
  pathParameters: string[],
  inType: 'all' | 'path' | 'query',
  example: Record<string, any> | undefined,
): OpenAPIV3.ParameterObject[] | undefined => {
  if (!instanceofZodType(schema)) {
    schema = z.void();
  }

  const isRequired = !schema.isOptional();
  const unwrappedSchema = unwrapZodType(schema, true);

  if (pathParameters.length === 0 && instanceofZodTypeLikeVoid(unwrappedSchema)) {
    return undefined;
  }

  if (!instanceofZodTypeObject(unwrappedSchema)) {
    throw new TRPCError({
      message: 'Input parser must be a ZodObject',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  const shape = unwrappedSchema.shape;
  const shapeKeys = Object.keys(shape);

  for (const pathParameter of pathParameters) {
    if (!shapeKeys.includes(pathParameter)) {
      throw new TRPCError({
        message: `Input parser expects key from path: "${pathParameter}"`,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  }

  return shapeKeys
    .filter((shapeKey) => {
      const isPathParameter = pathParameters.includes(shapeKey);
      if (inType === 'path') {
        return isPathParameter;
      } else if (inType === 'query') {
        return !isPathParameter;
      }
      return true;
    })
    .map((shapeKey) => {
      let shapeSchema = shape[shapeKey]!;
      const isShapeRequired = !shapeSchema.isOptional();
      const isPathParameter = pathParameters.includes(shapeKey);

      if (!instanceofZodTypeLikeString(shapeSchema)) {
        if (zodSupportsCoerce) {
          if (!instanceofZodTypeCoercible(shapeSchema)) {
            throw new TRPCError({
              message: `Input parser key: "${shapeKey}" must be ZodString, ZodNumber, ZodBoolean, ZodBigInt or ZodDate`,
              code: 'INTERNAL_SERVER_ERROR',
            });
          }
        } else {
          throw new TRPCError({
            message: `Input parser key: "${shapeKey}" must be ZodString`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
      }

      if (instanceofZodTypeOptional(shapeSchema)) {
        if (isPathParameter) {
          throw new TRPCError({
            message: `Path parameter: "${shapeKey}" must not be optional`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
        shapeSchema = shapeSchema.unwrap();
      }

      const { description, ...openApiSchemaObject } = zodSchemaToOpenApiSchemaObject(shapeSchema);

      return {
        name: shapeKey,
        in: isPathParameter ? 'path' : 'query',
        required: isPathParameter || (isRequired && isShapeRequired),
        schema: openApiSchemaObject,
        description: description,
        example: example?.[shapeKey],
      };
    });
};

export const getRequestBodyObject = (
  schema: unknown,
  pathParameters: string[],
  contentTypes: OpenApiContentType[],
  example: Record<string, any> | undefined,
): OpenAPIV3.RequestBodyObject | undefined => {
  if (!instanceofZodType(schema)) {
    schema = z.void();
  }

  const isRequired = !schema.isOptional();
  const unwrappedSchema = unwrapZodType(schema, true);

  if (pathParameters.length === 0 && instanceofZodTypeLikeVoid(unwrappedSchema)) {
    return undefined;
  }

  if (!instanceofZodTypeObject(unwrappedSchema)) {
    throw new TRPCError({
      message: 'Input parser must be a ZodObject',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  // remove path parameters
  const mask: Record<string, true> = {};
  const dedupedExample = example && { ...example };
  pathParameters.forEach((pathParameter) => {
    mask[pathParameter] = true;
    if (dedupedExample) {
      delete dedupedExample[pathParameter];
    }
  });
  const dedupedSchema = unwrappedSchema.omit(mask);

  // if all keys are path parameters
  if (pathParameters.length > 0 && Object.keys(dedupedSchema.shape).length === 0) {
    return undefined;
  }

  const openApiSchemaObject = zodSchemaToOpenApiSchemaObject(dedupedSchema);
  const content: OpenAPIV3.RequestBodyObject['content'] = {};
  for (const contentType of contentTypes) {
    content[contentType] = {
      schema: openApiSchemaObject,
      example: dedupedExample,
    };
  }

  return {
    required: isRequired,
    content,
  };
};

export const errorResponseObject: OpenAPIV3.ResponseObject = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: zodSchemaToOpenApiSchemaObject(
        z.object({
          message: z.string(),
          code: z.string(),
          issues: z.array(z.object({ message: z.string() })).optional(),
        }),
      ),
    },
  },
};

export const getResponsesObject = (
  schema: unknown,
  example: Record<string, any> | undefined,
  headers: Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject> | undefined
): OpenAPIV3.ResponsesObject => {
  if (!instanceofZodType(schema)) {
    schema = z.any();
  }

  const successResponseObject: OpenAPIV3.ResponseObject = {
    description: 'Successful response',
    headers: headers,
    content: {
      'application/json': {
        schema: zodSchemaToOpenApiSchemaObject(schema),
        example,
      },
    },
  };

  return {
    200: successResponseObject,
    default: {
      $ref: '#/components/responses/error',
    },
  };
};
