import { NextResponse } from 'next/server';

import { openApiDocument } from '../../../server/openapi';

// Respond with our OpenAPI schema
export const GET = () => {
  return NextResponse.json(openApiDocument);
};
