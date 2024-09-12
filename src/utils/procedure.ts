// eslint-disable-next-line import/no-unresolved
import { ProcedureType } from '@trpc/server';
import { AnyZodObject, z } from 'zod';

import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';
import { RouterRecord } from '@trpc/server/unstable-core-do-not-import';

const mergeInputs = (inputParsers: AnyZodObject[]): AnyZodObject => {
  return inputParsers.reduce((acc, inputParser) => {
    return acc.merge(inputParser);
  }, z.object({}));
};

// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (procedure: OpenApiProcedure) => {
  const { inputs, output } = procedure._def;
  return {
    inputParser: inputs.length >= 2 ? mergeInputs(inputs as AnyZodObject[]) : inputs[0],
    outputParser: output,
  };
};

const getProcedureType = (procedure: OpenApiProcedure) => procedure._def.type;

export const forEachOpenApiProcedure = (
  procedureRecord: OpenApiProcedureRecord,
  callback: (values: {
    path: string;
    type: ProcedureType;
    procedure: OpenApiProcedure;
    openapi: NonNullable<OpenApiMeta['openapi']>;
  }) => void,
) => {
  for (const [path, procedure] of Object.entries(procedureRecord)) {
    const { openapi } = (procedure._def as RouterRecord).meta as OpenApiMeta ?? {};
    if (openapi && openapi.enabled !== false) {
      const type = getProcedureType(procedure as unknown as OpenApiProcedure);

      if(type){
        callback({ path, type, procedure: procedure as unknown as OpenApiProcedure, openapi });
      }
    }
  }
};
