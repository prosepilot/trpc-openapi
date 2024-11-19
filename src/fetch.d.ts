// See the comment at the top of src/adapters/fetch.ts for why this file is
// necessary.

declare module 'node-mocks-http/lib/mockRequest' {
  export { createRequest } from 'node-mocks-http';
}

declare module 'node-mocks-http/lib/mockResponse' {
  export { createResponse } from 'node-mocks-http';
}
