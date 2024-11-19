import { createOpenApiFetchHandler } from 'trpc-openapi';

import { appRouter, createContext } from '../../../server/router';

const handler = (req: Request) => {
  // Handle incoming OpenAPI requests
  return createOpenApiFetchHandler({
    endpoint: '/api',
    router: appRouter,
    createContext,
    req,
  });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
