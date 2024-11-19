import { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';

import { zodSchemaToOpenApiSchemaObject } from '../generator/schema';

export let zodComponentSchemaGenerator: (() => { [key: string]: any }) | undefined;

export let zodComponentDefinitions: Record<string, z.ZodType> | undefined;

export const setZodComponentDefinitions = (definitions: Record<string, z.ZodType>) => {
  zodComponentDefinitions = definitions;
};

export const setZodComponentSchemaGenerator = (generator: typeof zodComponentSchemaGenerator) => {
  zodComponentSchemaGenerator = generator;
};

// Does not support references (breaks in weird ways if references are used)
export const experimentalZodSchemaGenerator = (): { [key: string]: OpenAPIV3.SchemaObject } => {
  return zodComponentDefinitions
    ? Object.fromEntries(
        Object.entries(zodComponentDefinitions).map(([key, value]) => [
          key,
          zodSchemaToOpenApiSchemaObject(value, true),
        ]),
      )
    : {};
};
