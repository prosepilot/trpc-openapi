/**
 * @jest-environment @edge-runtime/jest-environment
 */
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import z from 'zod';

import { OpenApiMeta } from '../../src';
import { CreateFetchContextFn, createOpenApiFetchHandler } from '../../src/adapters/fetch';

const createRouter = () => {
  const t = initTRPC.context<{ user?: string }>().meta<OpenApiMeta>().create();

  return t.router({
    getHello: t.procedure
      .meta({ openapi: { path: '/hello', method: 'GET' } })
      .input(z.object({ name: z.string().optional() }))
      .output(z.object({ greeting: z.string() }))
      .query(({ input, ctx }) => ({
        greeting: `Hello ${ctx.user ?? input.name ?? 'world'}`,
      })),
    postHello: t.procedure
      .meta({ openapi: { path: '/hello', method: 'POST' } })
      .input(z.object({ name: z.string() }))
      .output(z.object({ greeting: z.string() }))
      .mutation(({ input, ctx }) => ({
        greeting: `Hello ${ctx.user ?? input.name}`,
      })),
  });
};

describe('fetch adapter', () => {
  const router = createRouter();
  const createContext: CreateFetchContextFn<typeof router> = ({ req }) => ({
    user: req.headers.get('X-USER') as string | undefined,
  });
  const handler = createOpenApiFetchHandler({
    endpoint: '/trpc',
    router,
    createContext,
  });

  test('with query input', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello?name=James'));
    const res = await handler(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ greeting: 'Hello James' });
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('with JSON input', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sam' }),
    });
    const res = await handler(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ greeting: 'Hello Sam' });
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('with url encoded body input', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Aphex',
    });
    const res = await handler(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ greeting: 'Hello Aphex' });
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('with context', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello?name=James'), {
      headers: {
        'X-USER': 'Twin',
      },
    });
    const res = await handler(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ greeting: 'Hello Twin' });
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('with bad input', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(body).toEqual({
      message: 'Input validation failed',
      code: 'BAD_REQUEST',
      issues: [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Required',
          path: ['name'],
          received: 'undefined',
        },
      ],
    });
  });

  test('with invalid body', async () => {
    const req = new Request(new URL('http://localhost/trpc/hello'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'asdf',
    });
    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(body).toEqual({
      message: 'Failed to parse request body',
      code: 'PARSE_ERROR',
    });
  });
});
