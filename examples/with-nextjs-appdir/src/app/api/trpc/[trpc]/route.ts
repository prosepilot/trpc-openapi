import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter, createContext } from '../../../../server/router';

const handler = (req: Request) => {
  return fetchRequestHandler({
    req,
    endpoint: '/api/trpc',
    router: appRouter,
    createContext,
  });
};

export { handler as GET, handler as POST };
