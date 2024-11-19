import { TRPCError } from '@trpc/server';
import { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import { OpenApiContentType } from '../types';
import {
  instanceofZodType,
  instanceofZodTypeArray,
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
  arrayParameterName: string = "parameter", // Optional parameter name for arrays
): OpenAPIV3.ParameterObject[] | undefined => {
  if (!instanceofZodType(schema)) {
    throw new TRPCError({
      message: 'Input parser expects a Zod validator',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  const isRequired = !schema.isOptional();
  let unwrappedSchema = unwrapZodType(schema, true);

  if (pathParameters.length === 0 && instanceofZodTypeLikeVoid(unwrappedSchema)) {
    return undefined;
  }

  if (instanceofZodTypeObject(unwrappedSchema)) {
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
  } else if (instanceofZodTypeArray(unwrappedSchema)) {
    if (!arrayParameterName) {
      throw new TRPCError({
        message: 'Array parameter name must be provided for array schemas',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }

    const isPathParameter = pathParameters.includes(arrayParameterName);
    const parameterIn = isPathParameter ? 'path' : 'query';

    if (isPathParameter && inType !== 'path') {
      // Skip if we're not processing path parameters
      return undefined;
    } else if (!isPathParameter && inType !== 'query') {
      // Skip if we're not processing query parameters
      return undefined;
    }

    if (instanceofZodTypeOptional(unwrappedSchema)) {
      if (isPathParameter) {
        throw new TRPCError({
          message: `Path parameter: "${arrayParameterName}" must not be optional`,
          code: 'INTERNAL_SERVER_ERROR',
        });
      }
      unwrappedSchema = unwrappedSchema.unwrap();
    }

    const { description, ...openApiSchemaObject } = zodSchemaToOpenApiSchemaObject(unwrappedSchema);

    return [
      {
        name: arrayParameterName,
        in: parameterIn,
        required: isPathParameter || isRequired,
        schema: openApiSchemaObject,
        description: description,
        example: example?.[arrayParameterName],
        style: 'form',
        explode: true,
      },
    ];
  } else {
    throw new TRPCError({
      message: 'Input parser must be a ZodObject or ZodArray',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

export const getRequestBodyObject = (
  schema: unknown,
  pathParameters: string[],
  contentTypes: OpenApiContentType[],
  example: Record<string, any> | undefined,
): OpenAPIV3.RequestBodyObject | undefined => {
  if (!instanceofZodType(schema)) {
    throw new TRPCError({
      message: 'Input parser expects a Zod validator',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  const isRequired = !schema.isOptional();
  const unwrappedSchema = unwrapZodType(schema, true);

  if (pathParameters.length === 0 && instanceofZodTypeLikeVoid(unwrappedSchema)) {
    return undefined;
  }

  if (
    !instanceofZodTypeObject(unwrappedSchema) &&
    !instanceofZodTypeArray(unwrappedSchema)
  ) {
    throw new TRPCError({
      message: 'Input parser must be a ZodObject or ZodArray',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  let dedupedSchema: z.ZodTypeAny;
  let dedupedExample = example && { ...example };

  if (instanceofZodTypeObject(unwrappedSchema)) {
    // Remove path parameters from the object schema
    const mask: Record<string, true> = {};
    pathParameters.forEach((pathParameter) => {
      mask[pathParameter] = true;
      if (dedupedExample) {
        delete dedupedExample[pathParameter];
      }
    });
    const dedupedObjectSchema = unwrappedSchema.omit(mask);

    // If all keys are path parameters
    if (
      pathParameters.length > 0 &&
      Object.keys(dedupedObjectSchema.shape).length === 0
    ) {
      return undefined;
    }

    dedupedSchema = dedupedObjectSchema;
  } else if (instanceofZodTypeArray(unwrappedSchema)) {
    const elementSchema = unwrappedSchema.element;

    // Remove the restriction on array element types
    let dedupedElementSchema: z.ZodTypeAny = elementSchema;

    if (instanceofZodTypeObject(elementSchema)) {
      // Remove path parameters from the element schema
      const mask: Record<string, true> = {};
      pathParameters.forEach((pathParameter) => {
        mask[pathParameter] = true;
      });

      dedupedElementSchema = elementSchema.omit(mask);

      // If all keys are path parameters in the element schema
      if (
        pathParameters.length > 0 &&
        Object.keys((dedupedElementSchema as z.ZodObject<z.ZodRawShape>).shape).length === 0
      ) {
        return undefined;
      }

      // Adjust the example data for arrays of objects
      if (dedupedExample && Array.isArray(dedupedExample)) {
        dedupedExample = dedupedExample.map((item) => {
          if (typeof item === 'object' && item !== null) {
            const newItem = { ...item };
            pathParameters.forEach((pathParameter) => {
              delete newItem[pathParameter];
            });
            return newItem;
          }
          return item;
        });
      }
    } else {
      // For primitive types, we can't omit path parameters
      // Proceed without modifying the element schema
      if (pathParameters.length > 0) {
        // If path parameters exist, and elements are primitive types,
        // you might need to handle this case according to your needs
      }
    }

    // Reconstruct the array schema with the deduped element schema
    dedupedSchema = z.array(dedupedElementSchema);
  } else {
    throw new TRPCError({
      message: 'Input parser must be a ZodObject or ZodArray',
      code: 'INTERNAL_SERVER_ERROR',
    });
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
    throw new TRPCError({
      message: 'Output parser expects a Zod validator',
      code: 'INTERNAL_SERVER_ERROR',
    });
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
