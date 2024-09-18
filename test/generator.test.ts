import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import openAPISchemaValidator from 'openapi-schema-validator';
import { z } from 'zod';

import {
  GenerateOpenApiDocumentOptions,
  OpenApiMeta,
  generateOpenApiDocument,
  openApiVersion,
} from '../src';
import * as zodUtils from '../src/utils/zod';

// TODO: test for duplicate paths (using getPathRegExp)

const openApiSchemaValidator = new openAPISchemaValidator({ version: openApiVersion });

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

const defaultDocOpts: GenerateOpenApiDocumentOptions = {
  title: 'tRPC OpenAPI',
  version: '1.0.0',
  baseUrl: 'http://localhost:3000/api',
};

describe('generator', () => {
  test('open api version', () => {
    expect(openApiVersion).toBe('3.0.3');
  });

  test('with empty router', () => {
    const appRouter = t.router({});

    const openApiDocument = generateOpenApiDocument(appRouter, {
      title: 'tRPC OpenAPI',
      version: '1.0.0',
      description: 'API documentation',
      baseUrl: 'http://localhost:3000/api',
      docsUrl: 'http://localhost:3000/docs',
      tags: [],
    });

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument).toMatchInlineSnapshot(`
      Object {
        "components": Object {
          "responses": Object {
            "error": Object {
              "content": Object {
                "application/json": Object {
                  "schema": Object {
                    "additionalProperties": false,
                    "properties": Object {
                      "code": Object {
                        "type": "string",
                      },
                      "issues": Object {
                        "items": Object {
                          "additionalProperties": false,
                          "properties": Object {
                            "message": Object {
                              "type": "string",
                            },
                          },
                          "required": Array [
                            "message",
                          ],
                          "type": "object",
                        },
                        "type": "array",
                      },
                      "message": Object {
                        "type": "string",
                      },
                    },
                    "required": Array [
                      "message",
                      "code",
                    ],
                    "type": "object",
                  },
                },
              },
              "description": "Error response",
            },
          },
          "securitySchemes": Object {
            "Authorization": Object {
              "scheme": "bearer",
              "type": "http",
            },
          },
        },
        "externalDocs": Object {
          "url": "http://localhost:3000/docs",
        },
        "info": Object {
          "description": "API documentation",
          "title": "tRPC OpenAPI",
          "version": "1.0.0",
        },
        "openapi": "3.0.3",
        "paths": Object {},
        "servers": Array [
          Object {
            "url": "http://localhost:3000/api",
          },
        ],
        "tags": Array [],
      }
    `);
  });

  test('with missing input', () => {
    {
      const appRouter = t.router({
        noInput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/no-input' } })
          .output(z.object({ name: z.string() }))
          .query(() => ({ name: 'jlalmes' })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.noInput] - Input parser expects a Zod validator');
    }
    {
      const appRouter = t.router({
        noInput: t.procedure
          .meta({ openapi: { method: 'POST', path: '/no-input' } })
          .output(z.object({ name: z.string() }))
          .mutation(() => ({ name: 'jlalmes' })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[mutation.noInput] - Input parser expects a Zod validator');
    }
  });

  test('with missing output', () => {
    {
      const appRouter = t.router({
        noOutput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/no-output' } })
          .input(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.noOutput] - Output parser expects a Zod validator');
    }
    {
      const appRouter = t.router({
        noOutput: t.procedure
          .meta({ openapi: { method: 'POST', path: '/no-output' } })
          .input(z.object({ name: z.string() }))
          .mutation(({ input }) => ({ name: input.name })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[mutation.noOutput] - Output parser expects a Zod validator');
    }
  });

  test('with non-zod parser', () => {
    {
      const appRouter = t.router({
        badInput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/bad-input' } })
          .input((arg) => ({ payload: typeof arg === 'string' ? arg : String(arg) }))
          .output(z.object({ payload: z.string() }))
          .query(({ input }) => ({ payload: 'Hello world!' })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.badInput] - Input parser expects a Zod validator');
    }
    {
      const appRouter = t.router({
        badInput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/bad-input' } })
          .input(z.object({ payload: z.string() }))
          .output((arg) => ({ payload: typeof arg === 'string' ? arg : String(arg) }))
          .query(({ input }) => ({ payload: input.payload })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.badInput] - Output parser expects a Zod validator');
    }
  });

  test('with non-object input', () => {
    {
      const appRouter = t.router({
        badInput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/bad-input' } })
          .input(z.string())
          .output(z.null())
          .query(() => null),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.badInput] - Input parser must be a ZodObject or ZodArray');
    }
    {
      const appRouter = t.router({
        badInput: t.procedure
          .meta({ openapi: { method: 'POST', path: '/bad-input' } })
          .input(z.string())
          .output(z.null())
          .mutation(() => null),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[mutation.badInput] - Input parser must be a ZodObject or ZodArray');
    }
  });

  test('with object non-string input', () => {
    // only applies when zod does not support (below version v3.20.0)
  
    // @ts-expect-error - hack to disable zodSupportsCoerce
    // eslint-disable-next-line import/namespace
    zodUtils.zodSupportsCoerce = false;
  
    {
      const appRouter = t.router({
        badInput: t.procedure
          .meta({ openapi: { method: 'GET', path: '/bad-input' } })
          .input(z.object({ age: z.number().min(0).max(122) }))
          .output(z.object({ name: z.string() }))
          .query(() => ({ name: 'jlalmes' })),
      });
  
      // Instead of expecting an error, we generate the OpenAPI document
      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);
  
      // Assert that the document is generated correctly
      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/bad-input']!.get!.parameters).toMatchInlineSnapshot(`
        Array [
          Object {
            "description": undefined,
            "example": undefined,
            "in": "query",
            "name": "age",
            "required": true,
            "schema": Object {
              "maximum": 122,
              "minimum": 0,
              "type": "number",
            },
          },
        ]
      `);
    }
  
    // @ts-expect-error - hack to re-enable zodSupportsCoerce
    // eslint-disable-next-line import/namespace
    zodUtils.zodSupportsCoerce = true;
  });

  test('with bad method', () => {
    const appRouter = t.router({
      badMethod: t.procedure
        // @ts-expect-error - bad method
        .meta({ openapi: { method: 'BAD_METHOD', path: '/bad-method' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ name: z.string() }))
        .query(({ input }) => ({ name: input.name })),
    });

    expect(() => {
      generateOpenApiDocument(appRouter, defaultDocOpts);
    }).toThrowError('[query.badMethod] - Method must be GET, POST, PATCH, PUT or DELETE');
  });

  test('with duplicate routes', () => {
    {
      const appRouter = t.router({
        procedure1: t.procedure
          .meta({ openapi: { method: 'GET', path: '/procedure' } })
          .input(z.object({ name: z.string() }))
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
        procedure2: t.procedure
          .meta({ openapi: { method: 'GET', path: '/procedure' } })
          .input(z.object({ name: z.string() }))
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.procedure2] - Duplicate procedure defined for route GET /procedure');
    }
    {
      const appRouter = t.router({
        procedure1: t.procedure
          .meta({ openapi: { method: 'GET', path: '/procedure/' } })
          .input(z.object({ name: z.string() }))
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
        procedure2: t.procedure
          .meta({ openapi: { method: 'GET', path: '/procedure' } })
          .input(z.object({ name: z.string() }))
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[query.procedure2] - Duplicate procedure defined for route GET /procedure');
    }
  });

  test('with unsupported subscription', () => {
    const appRouter = t.router({
      currentName: t.procedure
        .meta({ openapi: { method: 'PATCH', path: '/current-name' } })
        .input(z.object({ name: z.string() }))
        .subscription(({ input }) => {
          return observable((emit) => {
            emit.next(input.name);
            return () => null;
          });
        }),
    });

    expect(() => {
      generateOpenApiDocument(appRouter, defaultDocOpts);
    }).toThrowError('[subscription.currentName] - Subscriptions are not supported by OpenAPI v3');
  });

  test('with void and path parameters', () => {
    const appRouter = t.router({
      pathParameters: t.procedure
        .meta({ openapi: { method: 'GET', path: '/path-parameters/{name}' } })
        .input(z.void())
        .output(z.object({ name: z.string() }))
        .query(() => ({ name: 'asdf' })),
    });

    expect(() => {
      generateOpenApiDocument(appRouter, defaultDocOpts);
    }).toThrowError('[query.pathParameters] - Input parser must be a ZodObject or ZodArray');
  });

  test('with optional path parameters', () => {
    const appRouter = t.router({
      pathParameters: t.procedure
        .meta({ openapi: { method: 'GET', path: '/path-parameters/{name}' } })
        .input(z.object({ name: z.string().optional() }))
        .output(z.object({ name: z.string() }))
        .query(() => ({ name: 'asdf' })),
    });

    expect(() => {
      generateOpenApiDocument(appRouter, defaultDocOpts);
    }).toThrowError('[query.pathParameters] - Path parameter: "name" must not be optional');
  });

  test('with missing path parameters', () => {
    const appRouter = t.router({
      pathParameters: t.procedure
        .meta({ openapi: { method: 'GET', path: '/path-parameters/{name}' } })
        .input(z.object({}))
        .output(z.object({ name: z.string() }))
        .query(() => ({ name: 'asdf' })),
    });

    expect(() => {
      generateOpenApiDocument(appRouter, defaultDocOpts);
    }).toThrowError('[query.pathParameters] - Input parser expects key from path: "name"');
  });

  // test for https://github.com/jlalmes/trpc-openapi/issues/296
  test('with post & only path paramters', () => {
    const appRouter = t.router({
      noBody: t.procedure
        .meta({ openapi: { method: 'POST', path: '/no-body/{name}' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ name: z.string() }))
        .mutation(({ input }) => ({ name: input.name })),
      emptyBody: t.procedure
        .meta({ openapi: { method: 'POST', path: '/empty-body' } })
        .input(z.object({}))
        .output(z.object({ name: z.string() }))
        .mutation(() => ({ name: 'James' })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/no-body/{name}']!.post!.requestBody).toBe(undefined);
    expect(openApiDocument.paths['/empty-body']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {},
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
  });

  test('with valid procedures', () => {
    const appRouter = t.router({
      createUser: t.procedure
        .meta({ openapi: { method: 'POST', path: '/users' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ id: z.string(), name: z.string() }))
        .mutation(({ input }) => ({ id: 'user-id', name: input.name })),
      readUsers: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users' } })
        .input(z.void())
        .output(z.array(z.object({ id: z.string(), name: z.string() })))
        .query(() => [{ id: 'user-id', name: 'name' }]),
      readUser: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{id}' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string(), name: z.string() }))
        .query(({ input }) => ({ id: input.id, name: 'name' })),
      updateUser: t.procedure
        .meta({ openapi: { method: 'PATCH', path: '/users/{id}' } })
        .input(z.object({ id: z.string(), name: z.string().optional() }))
        .output(z.object({ id: z.string(), name: z.string() }))
        .mutation(({ input }) => ({ id: input.id, name: input.name ?? 'name' })),
      deleteUser: t.procedure
        .meta({ openapi: { method: 'DELETE', path: '/users/{id}' } })
        .input(z.object({ id: z.string() }))
        .output(z.void())
        .mutation(() => undefined),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument).toMatchInlineSnapshot(`
      Object {
        "components": Object {
          "responses": Object {
            "error": Object {
              "content": Object {
                "application/json": Object {
                  "schema": Object {
                    "additionalProperties": false,
                    "properties": Object {
                      "code": Object {
                        "type": "string",
                      },
                      "issues": Object {
                        "items": Object {
                          "additionalProperties": false,
                          "properties": Object {
                            "message": Object {
                              "type": "string",
                            },
                          },
                          "required": Array [
                            "message",
                          ],
                          "type": "object",
                        },
                        "type": "array",
                      },
                      "message": Object {
                        "type": "string",
                      },
                    },
                    "required": Array [
                      "message",
                      "code",
                    ],
                    "type": "object",
                  },
                },
              },
              "description": "Error response",
            },
          },
          "securitySchemes": Object {
            "Authorization": Object {
              "scheme": "bearer",
              "type": "http",
            },
          },
        },
        "externalDocs": undefined,
        "info": Object {
          "description": undefined,
          "title": "tRPC OpenAPI",
          "version": "1.0.0",
        },
        "openapi": "3.0.3",
        "paths": Object {
          "/users": Object {
            "get": Object {
              "description": undefined,
              "operationId": "readUsers",
              "parameters": Array [],
              "requestBody": undefined,
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": undefined,
                      "schema": Object {
                        "items": Object {
                          "additionalProperties": false,
                          "properties": Object {
                            "id": Object {
                              "type": "string",
                            },
                            "name": Object {
                              "type": "string",
                            },
                          },
                          "required": Array [
                            "id",
                            "name",
                          ],
                          "type": "object",
                        },
                        "type": "array",
                      },
                    },
                  },
                  "description": "Successful response",
                  "headers": undefined,
                },
                "default": Object {
                  "$ref": "#/components/responses/error",
                },
              },
              "security": undefined,
              "summary": undefined,
              "tags": undefined,
            },
            "post": Object {
              "description": undefined,
              "operationId": "createUser",
              "parameters": Array [],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "example": undefined,
                    "schema": Object {
                      "additionalProperties": false,
                      "properties": Object {
                        "name": Object {
                          "type": "string",
                        },
                      },
                      "required": Array [
                        "name",
                      ],
                      "type": "object",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": undefined,
                      "schema": Object {
                        "additionalProperties": false,
                        "properties": Object {
                          "id": Object {
                            "type": "string",
                          },
                          "name": Object {
                            "type": "string",
                          },
                        },
                        "required": Array [
                          "id",
                          "name",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Successful response",
                  "headers": undefined,
                },
                "default": Object {
                  "$ref": "#/components/responses/error",
                },
              },
              "security": undefined,
              "summary": undefined,
              "tags": undefined,
            },
          },
          "/users/{id}": Object {
            "delete": Object {
              "description": undefined,
              "operationId": "deleteUser",
              "parameters": Array [
                Object {
                  "description": undefined,
                  "example": undefined,
                  "in": "path",
                  "name": "id",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "requestBody": undefined,
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": undefined,
                      "schema": Object {},
                    },
                  },
                  "description": "Successful response",
                  "headers": undefined,
                },
                "default": Object {
                  "$ref": "#/components/responses/error",
                },
              },
              "security": undefined,
              "summary": undefined,
              "tags": undefined,
            },
            "get": Object {
              "description": undefined,
              "operationId": "readUser",
              "parameters": Array [
                Object {
                  "description": undefined,
                  "example": undefined,
                  "in": "path",
                  "name": "id",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "requestBody": undefined,
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": undefined,
                      "schema": Object {
                        "additionalProperties": false,
                        "properties": Object {
                          "id": Object {
                            "type": "string",
                          },
                          "name": Object {
                            "type": "string",
                          },
                        },
                        "required": Array [
                          "id",
                          "name",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Successful response",
                  "headers": undefined,
                },
                "default": Object {
                  "$ref": "#/components/responses/error",
                },
              },
              "security": undefined,
              "summary": undefined,
              "tags": undefined,
            },
            "patch": Object {
              "description": undefined,
              "operationId": "updateUser",
              "parameters": Array [
                Object {
                  "description": undefined,
                  "example": undefined,
                  "in": "path",
                  "name": "id",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "example": undefined,
                    "schema": Object {
                      "additionalProperties": false,
                      "properties": Object {
                        "name": Object {
                          "type": "string",
                        },
                      },
                      "type": "object",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": undefined,
                      "schema": Object {
                        "additionalProperties": false,
                        "properties": Object {
                          "id": Object {
                            "type": "string",
                          },
                          "name": Object {
                            "type": "string",
                          },
                        },
                        "required": Array [
                          "id",
                          "name",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Successful response",
                  "headers": undefined,
                },
                "default": Object {
                  "$ref": "#/components/responses/error",
                },
              },
              "security": undefined,
              "summary": undefined,
              "tags": undefined,
            },
          },
        },
        "servers": Array [
          Object {
            "url": "http://localhost:3000/api",
          },
        ],
        "tags": undefined,
      }
    `);
  });

  test('with disabled', () => {
    const appRouter = t.router({
      getMe: t.procedure
        .meta({ openapi: { enabled: false, method: 'GET', path: '/me' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: input.id })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(Object.keys(openApiDocument.paths).length).toBe(0);
  });

  test('with summary, description & tags', () => {
    const appRouter = t.router({
      getMe: t.procedure
        .meta({
          openapi: {
            method: 'GET',
            path: '/metadata/all',
            summary: 'Short summary',
            description: 'Verbose description',
            tags: ['tagA', 'tagB'],
          },
        })
        .input(z.object({ name: z.string() }))
        .output(z.object({ name: z.string() }))
        .query(({ input }) => ({ name: input.name })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/metadata/all']!.get!.summary).toBe('Short summary');
    expect(openApiDocument.paths['/metadata/all']!.get!.description).toBe('Verbose description');
    expect(openApiDocument.paths['/metadata/all']!.get!.tags).toEqual(['tagA', 'tagB']);
  });

  test('with security', () => {
    const appRouter = t.router({
      protectedEndpoint: t.procedure
        .meta({ openapi: { method: 'POST', path: '/secure/endpoint', protect: true } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ name: z.string() }))
        .query(({ input }) => ({ name: input.name })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/secure/endpoint']!.post!.security).toEqual([
      { Authorization: [] },
    ]);
  });

  test('with schema descriptions', () => {
    const appRouter = t.router({
      createUser: t.procedure
        .meta({ openapi: { method: 'POST', path: '/user' } })
        .input(
          z
            .object({
              id: z.string().uuid().describe('User ID'),
              name: z.string().describe('User name'),
            })
            .describe('Request body input'),
        )
        .output(
          z
            .object({
              id: z.string().uuid().describe('User ID'),
              name: z.string().describe('User name'),
            })
            .describe('User data'),
        )
        .mutation(({ input }) => ({ id: input.id, name: 'James' })),
      getUser: t.procedure
        .meta({ openapi: { method: 'GET', path: '/user' } })
        .input(
          z.object({ id: z.string().uuid().describe('User ID') }).describe('Query string inputs'),
        )
        .output(
          z
            .object({
              id: z.string().uuid().describe('User ID'),
              name: z.string().describe('User name'),
            })
            .describe('User data'),
        )
        .query(({ input }) => ({ id: input.id, name: 'James' })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/user']!.post!).toMatchInlineSnapshot(`
      Object {
        "description": undefined,
        "operationId": "createUser",
        "parameters": Array [],
        "requestBody": Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {
                "additionalProperties": false,
                "description": "Request body input",
                "properties": Object {
                  "id": Object {
                    "description": "User ID",
                    "format": "uuid",
                    "type": "string",
                  },
                  "name": Object {
                    "description": "User name",
                    "type": "string",
                  },
                },
                "required": Array [
                  "id",
                  "name",
                ],
                "type": "object",
              },
            },
          },
          "required": true,
        },
        "responses": Object {
          "200": Object {
            "content": Object {
              "application/json": Object {
                "example": undefined,
                "schema": Object {
                  "additionalProperties": false,
                  "description": "User data",
                  "properties": Object {
                    "id": Object {
                      "description": "User ID",
                      "format": "uuid",
                      "type": "string",
                    },
                    "name": Object {
                      "description": "User name",
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "id",
                    "name",
                  ],
                  "type": "object",
                },
              },
            },
            "description": "Successful response",
            "headers": undefined,
          },
          "default": Object {
            "$ref": "#/components/responses/error",
          },
        },
        "security": undefined,
        "summary": undefined,
        "tags": undefined,
      }
    `);
    expect(openApiDocument.paths['/user']!.get!).toMatchInlineSnapshot(`
      Object {
        "description": undefined,
        "operationId": "getUser",
        "parameters": Array [
          Object {
            "description": "User ID",
            "example": undefined,
            "in": "query",
            "name": "id",
            "required": true,
            "schema": Object {
              "format": "uuid",
              "type": "string",
            },
          },
        ],
        "requestBody": undefined,
        "responses": Object {
          "200": Object {
            "content": Object {
              "application/json": Object {
                "example": undefined,
                "schema": Object {
                  "additionalProperties": false,
                  "description": "User data",
                  "properties": Object {
                    "id": Object {
                      "description": "User ID",
                      "format": "uuid",
                      "type": "string",
                    },
                    "name": Object {
                      "description": "User name",
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "id",
                    "name",
                  ],
                  "type": "object",
                },
              },
            },
            "description": "Successful response",
            "headers": undefined,
          },
          "default": Object {
            "$ref": "#/components/responses/error",
          },
        },
        "security": undefined,
        "summary": undefined,
        "tags": undefined,
      }
    `);
  });

  test('with void', () => {
    {
      const appRouter = t.router({
        void: t.procedure
          .meta({ openapi: { method: 'GET', path: '/void' } })
          .input(z.void())
          .output(z.void())
          .query(() => undefined),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/void']!.get!.parameters).toEqual([]);
      expect(openApiDocument.paths['/void']!.get!.responses[200]).toMatchInlineSnapshot(`
        Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {},
            },
          },
          "description": "Successful response",
          "headers": undefined,
        }
      `);
    }
    {
      const appRouter = t.router({
        void: t.procedure
          .meta({ openapi: { method: 'POST', path: '/void' } })
          .input(z.void())
          .output(z.void())
          .mutation(() => undefined),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/void']!.post!.requestBody).toMatchInlineSnapshot(`undefined`);
      expect(openApiDocument.paths['/void']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {},
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
    }
  });

  test('with null', () => {
    const appRouter = t.router({
      null: t.procedure
        .meta({ openapi: { method: 'POST', path: '/null' } })
        .input(z.void())
        .output(z.null())
        .mutation(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/null']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "enum": Array [
                "null",
              ],
              "nullable": true,
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with undefined', () => {
    const appRouter = t.router({
      undefined: t.procedure
        .meta({ openapi: { method: 'POST', path: '/undefined' } })
        .input(z.undefined())
        .output(z.undefined())
        .mutation(() => undefined),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/undefined']!.post!.requestBody).toMatchInlineSnapshot(
      `undefined`,
    );
    expect(openApiDocument.paths['/undefined']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "not": Object {},
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with nullish', () => {
    const appRouter = t.router({
      nullish: t.procedure
        .meta({ openapi: { method: 'POST', path: '/nullish' } })
        .input(z.void())
        .output(z.string().nullish())
        .mutation(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/nullish']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "not": Object {},
                },
                Object {
                  "nullable": true,
                  "type": "string",
                },
              ],
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with never', () => {
    const appRouter = t.router({
      never: t.procedure
        .meta({ openapi: { method: 'POST', path: '/never' } })
        .input(z.never())
        .output(z.never())
        // @ts-expect-error - cannot return never
        .mutation(() => undefined),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/never']!.post!.requestBody).toMatchInlineSnapshot(`undefined`);
    expect(openApiDocument.paths['/never']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "not": Object {},
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with optional query param', () => {
    const appRouter = t.router({
      optionalParam: t.procedure
        .meta({ openapi: { method: 'GET', path: '/optional-param' } })
        .input(z.object({ one: z.string().optional(), two: z.string() }))
        .output(z.string().optional())
        .query(({ input }) => input.one),
      optionalObject: t.procedure
        .meta({ openapi: { method: 'GET', path: '/optional-object' } })
        .input(z.object({ one: z.string().optional(), two: z.string() }).optional())
        .output(z.string().optional())
        .query(({ input }) => input?.two),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/optional-param']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "one",
          "required": false,
          "schema": Object {
            "type": "string",
          },
        },
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "two",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/optional-param']!.get!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "not": Object {},
                },
                Object {
                  "type": "string",
                },
              ],
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
    expect(openApiDocument.paths['/optional-object']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "one",
          "required": false,
          "schema": Object {
            "type": "string",
          },
        },
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "two",
          "required": false,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/optional-object']!.get!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "not": Object {},
                },
                Object {
                  "type": "string",
                },
              ],
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with optional request body', () => {
    const appRouter = t.router({
      optionalParam: t.procedure
        .meta({ openapi: { method: 'POST', path: '/optional-param' } })
        .input(z.object({ one: z.string().optional(), two: z.string() }))
        .output(z.string().optional())
        .query(({ input }) => input.one),
      optionalObject: t.procedure
        .meta({ openapi: { method: 'POST', path: '/optional-object' } })
        .input(z.object({ one: z.string().optional(), two: z.string() }).optional())
        .output(z.string().optional())
        .query(({ input }) => input?.two),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/optional-param']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "one": Object {
                  "type": "string",
                },
                "two": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "two",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
    expect(openApiDocument.paths['/optional-param']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "not": Object {},
                },
                Object {
                  "type": "string",
                },
              ],
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
    expect(openApiDocument.paths['/optional-object']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "one": Object {
                  "type": "string",
                },
                "two": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "two",
              ],
              "type": "object",
            },
          },
        },
        "required": false,
      }
    `);
    expect(openApiDocument.paths['/optional-object']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "not": Object {},
                },
                Object {
                  "type": "string",
                },
              ],
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with default', () => {
    const appRouter = t.router({
      default: t.procedure
        .meta({ openapi: { method: 'GET', path: '/default' } })
        .input(z.object({ payload: z.string().default('James') }))
        .output(z.string().default('James'))
        .query(({ input }) => input.payload),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/default']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": false,
          "schema": Object {
            "default": "James",
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/default']!.get!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "default": "James",
              "type": "string",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with refine', () => {
    {
      const appRouter = t.router({
        refine: t.procedure
          .meta({ openapi: { method: 'POST', path: '/refine' } })
          .input(z.object({ a: z.string().refine((arg) => arg.length > 10) }))
          .output(z.null())
          .mutation(() => null),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/refine']!.post!.requestBody).toMatchInlineSnapshot(`
        Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {
                "additionalProperties": false,
                "properties": Object {
                  "a": Object {
                    "type": "string",
                  },
                },
                "required": Array [
                  "a",
                ],
                "type": "object",
              },
            },
          },
          "required": true,
        }
      `);
    }
    {
      const appRouter = t.router({
        objectRefine: t.procedure
          .meta({ openapi: { method: 'POST', path: '/object-refine' } })
          .input(z.object({ a: z.string(), b: z.string() }).refine((data) => data.a === data.b))
          .output(z.null())
          .mutation(() => null),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/object-refine']!.post!.requestBody).toMatchInlineSnapshot(`
        Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {
                "additionalProperties": false,
                "properties": Object {
                  "a": Object {
                    "type": "string",
                  },
                  "b": Object {
                    "type": "string",
                  },
                },
                "required": Array [
                  "a",
                  "b",
                ],
                "type": "object",
              },
            },
          },
          "required": true,
        }
      `);
    }
  });

  test('with async refine', () => {
    {
      const appRouter = t.router({
        refine: t.procedure
          .meta({ openapi: { method: 'POST', path: '/refine' } })
          // eslint-disable-next-line @typescript-eslint/require-await
          .input(z.object({ a: z.string().refine(async (arg) => arg.length > 10) }))
          .output(z.null())
          .mutation(() => null),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/refine']!.post!.requestBody).toMatchInlineSnapshot(`
        Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {
                "additionalProperties": false,
                "properties": Object {
                  "a": Object {
                    "type": "string",
                  },
                },
                "required": Array [
                  "a",
                ],
                "type": "object",
              },
            },
          },
          "required": true,
        }
      `);
    }
    {
      const appRouter = t.router({
        objectRefine: t.procedure
          .meta({ openapi: { method: 'POST', path: '/object-refine' } })
          .input(
            // eslint-disable-next-line @typescript-eslint/require-await
            z.object({ a: z.string(), b: z.string() }).refine(async (data) => data.a === data.b),
          )
          .output(z.null())
          .mutation(() => null),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/object-refine']!.post!.requestBody).toMatchInlineSnapshot(`
        Object {
          "content": Object {
            "application/json": Object {
              "example": undefined,
              "schema": Object {
                "additionalProperties": false,
                "properties": Object {
                  "a": Object {
                    "type": "string",
                  },
                  "b": Object {
                    "type": "string",
                  },
                },
                "required": Array [
                  "a",
                  "b",
                ],
                "type": "object",
              },
            },
          },
          "required": true,
        }
      `);
    }
  });

  test('with transform', () => {
    const appRouter = t.router({
      transform: t.procedure
        .meta({ openapi: { method: 'GET', path: '/transform' } })
        .input(z.object({ age: z.string().transform((input) => parseInt(input)) }))
        .output(z.object({ age: z.string().transform((input) => parseInt(input)) }))
        .query(({ input }) => ({ age: input.age.toString() })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/transform']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "age",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with preprocess', () => {
    const appRouter = t.router({
      transform: t.procedure
        .meta({ openapi: { method: 'GET', path: '/preprocess' } })
        .input(
          z.object({
            payload: z.preprocess((arg) => {
              if (typeof arg === 'string') {
                return parseInt(arg);
              }
              return arg;
            }, z.number()),
          }),
        )
        .output(z.number())
        .query(({ input }) => input.payload),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/preprocess']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "type": "number",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/preprocess']!.get!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "type": "number",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with coerce', () => {
    const appRouter = t.router({
      transform: t.procedure
        .meta({ openapi: { method: 'GET', path: '/coerce' } })
        .input(z.object({ payload: z.number() }))
        .output(z.number())
        .query(({ input }) => input.payload),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/coerce']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "type": "number",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/coerce']!.get!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "type": "number",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with union', () => {
    {
      const appRouter = t.router({
        union: t.procedure
          .meta({ openapi: { method: 'GET', path: '/union' } })
          .input(z.object({ payload: z.string().or(z.number()) }))
          .output(z.null())
          .query(() => null),
      });
  
      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);
  
      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(openApiDocument.paths['/union']!.get!.parameters).toMatchInlineSnapshot(`
        Array [
          Object {
            "description": undefined,
            "example": undefined,
            "in": "query",
            "name": "payload",
            "required": true,
            "schema": Object {
              "anyOf": Array [
                Object {
                  "type": "string",
                },
                Object {
                  "type": "number",
                },
              ],
            },
          },
        ]
      `);
    }
  });

  test('with intersection', () => {
    const appRouter = t.router({
      intersection: t.procedure
        .meta({ openapi: { method: 'GET', path: '/intersection' } })
        .input(
          z.object({
            payload: z.intersection(
              z.union([z.literal('a'), z.literal('b')]),
              z.union([z.literal('b'), z.literal('c')]),
            ),
          }),
        )
        .output(z.null())
        .query(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/intersection']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "allOf": Array [
              Object {
                "anyOf": Array [
                  Object {
                    "enum": Array [
                      "a",
                    ],
                    "type": "string",
                  },
                  Object {
                    "enum": Array [
                      "b",
                    ],
                    "type": "string",
                  },
                ],
              },
              Object {
                "anyOf": Array [
                  Object {
                    "enum": Array [
                      "b",
                    ],
                    "type": "string",
                  },
                  Object {
                    "enum": Array [
                      "c",
                    ],
                    "type": "string",
                  },
                ],
              },
            ],
          },
        },
      ]
    `);
  });

  test('with lazy', () => {
    const appRouter = t.router({
      lazy: t.procedure
        .meta({ openapi: { method: 'GET', path: '/lazy' } })
        .input(z.object({ payload: z.lazy(() => z.string()) }))
        .output(z.null())
        .query(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/lazy']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with literal', () => {
    const appRouter = t.router({
      literal: t.procedure
        .meta({ openapi: { method: 'GET', path: '/literal' } })
        .input(z.object({ payload: z.literal('literal') }))
        .output(z.null())
        .query(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/literal']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "enum": Array [
              "literal",
            ],
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with enum', () => {
    const appRouter = t.router({
      enum: t.procedure
        .meta({ openapi: { method: 'GET', path: '/enum' } })
        .input(z.object({ name: z.enum(['James', 'jlalmes']) }))
        .output(z.null())
        .query(() => null),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/enum']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "name",
          "required": true,
          "schema": Object {
            "enum": Array [
              "James",
              "jlalmes",
            ],
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with native-enum', () => {
    enum ValidEnum {
      James = 'James',
      jlalmes = 'jlalmes',
    }
  
    const appRouter = t.router({
      nativeEnum: t.procedure
        .meta({ openapi: { method: 'GET', path: '/nativeEnum' } })
        .input(z.object({ name: z.nativeEnum(ValidEnum) }))
        .output(z.null())
        .query(() => null),
    });
  
    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);
  
    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/nativeEnum']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "name",
          "required": true,
          "schema": Object {
            "enum": Array [
              "James",
              "jlalmes",
            ],
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with no refs', () => {
    const schemas = { emails: z.array(z.string().email()) };

    const appRouter = t.router({
      refs: t.procedure
        .meta({ openapi: { method: 'POST', path: '/refs' } })
        .input(z.object({ allowed: schemas.emails, blocked: schemas.emails }))
        .output(z.object({ allowed: schemas.emails, blocked: schemas.emails }))
        .mutation(() => ({ allowed: [], blocked: [] })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/refs']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "allowed": Object {
                  "items": Object {
                    "format": "email",
                    "type": "string",
                  },
                  "type": "array",
                },
                "blocked": Object {
                  "items": Object {
                    "format": "email",
                    "type": "string",
                  },
                  "type": "array",
                },
              },
              "required": Array [
                "allowed",
                "blocked",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
    expect(openApiDocument.paths['/refs']!.post!.responses[200]).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "allowed": Object {
                  "items": Object {
                    "format": "email",
                    "type": "string",
                  },
                  "type": "array",
                },
                "blocked": Object {
                  "items": Object {
                    "format": "email",
                    "type": "string",
                  },
                  "type": "array",
                },
              },
              "required": Array [
                "allowed",
                "blocked",
              ],
              "type": "object",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with custom header', () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({
          openapi: {
            method: 'GET',
            path: '/echo',
            headers: [
              {
                name: 'x-custom-header',
                required: true,
                description: 'Some custom header',
              },
            ],
          },
        })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: input.id })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/echo']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": "Some custom header",
          "in": "header",
          "name": "x-custom-header",
          "required": true,
        },
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "id",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with DELETE mutation', () => {
    const appRouter = t.router({
      deleteMutation: t.procedure
        .meta({ openapi: { method: 'DELETE', path: '/mutation/delete' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .mutation(({ input }) => ({ id: input.id })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/mutation/delete']!.delete!.requestBody).toMatchInlineSnapshot(
      `undefined`,
    );
    expect(openApiDocument.paths['/mutation/delete']!.delete!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "id",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
  });

  test('with POST query', () => {
    const appRouter = t.router({
      postQuery: t.procedure
        .meta({ openapi: { method: 'POST', path: '/query/post' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: input.id })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/query/post']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "id": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "id",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
    expect(openApiDocument.paths['/query/post']!.post!.parameters).toMatchInlineSnapshot(
      `Array []`,
    );
  });

  test('with top-level preprocess', () => {
    const appRouter = t.router({
      topLevelPreprocessQuery: t.procedure
        .meta({ openapi: { method: 'GET', path: '/top-level-preprocess' } })
        .input(z.preprocess((arg) => arg, z.object({ id: z.string() })))
        .output(z.preprocess((arg) => arg, z.object({ id: z.string() })))
        .query(({ input }) => ({ id: input.id })),
      topLevelPreprocessMutation: t.procedure
        .meta({ openapi: { method: 'POST', path: '/top-level-preprocess' } })
        .input(z.preprocess((arg) => arg, z.object({ id: z.string() })))
        .output(z.preprocess((arg) => arg, z.object({ id: z.string() })))
        .mutation(({ input }) => ({ id: input.id })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/top-level-preprocess']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "id",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/top-level-preprocess']!.post!.requestBody)
      .toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "id": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "id",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
  });

  test('with nested routers', () => {
    const appRouter = t.router({
      procedure: t.procedure
        .meta({ openapi: { method: 'GET', path: '/procedure' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
      router: t.router({
        procedure: t.procedure
          .meta({ openapi: { method: 'GET', path: '/router/procedure' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .query(({ input }) => ({ payload: input.payload })),
        router: t.router({
          procedure: t.procedure
            .meta({ openapi: { method: 'GET', path: '/router/router/procedure' } })
            .input(z.object({ payload: z.string() }))
            .output(z.object({ payload: z.string() }))
            .query(({ input }) => ({ payload: input.payload })),
        }),
      }),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths).toMatchInlineSnapshot(`
      Object {
        "/procedure": Object {
          "get": Object {
            "description": undefined,
            "operationId": "procedure",
            "parameters": Array [
              Object {
                "description": undefined,
                "example": undefined,
                "in": "query",
                "name": "payload",
                "required": true,
                "schema": Object {
                  "type": "string",
                },
              },
            ],
            "requestBody": undefined,
            "responses": Object {
              "200": Object {
                "content": Object {
                  "application/json": Object {
                    "example": undefined,
                    "schema": Object {
                      "additionalProperties": false,
                      "properties": Object {
                        "payload": Object {
                          "type": "string",
                        },
                      },
                      "required": Array [
                        "payload",
                      ],
                      "type": "object",
                    },
                  },
                },
                "description": "Successful response",
                "headers": undefined,
              },
              "default": Object {
                "$ref": "#/components/responses/error",
              },
            },
            "security": undefined,
            "summary": undefined,
            "tags": undefined,
          },
        },
        "/router/procedure": Object {
          "get": Object {
            "description": undefined,
            "operationId": "router-procedure",
            "parameters": Array [
              Object {
                "description": undefined,
                "example": undefined,
                "in": "query",
                "name": "payload",
                "required": true,
                "schema": Object {
                  "type": "string",
                },
              },
            ],
            "requestBody": undefined,
            "responses": Object {
              "200": Object {
                "content": Object {
                  "application/json": Object {
                    "example": undefined,
                    "schema": Object {
                      "additionalProperties": false,
                      "properties": Object {
                        "payload": Object {
                          "type": "string",
                        },
                      },
                      "required": Array [
                        "payload",
                      ],
                      "type": "object",
                    },
                  },
                },
                "description": "Successful response",
                "headers": undefined,
              },
              "default": Object {
                "$ref": "#/components/responses/error",
              },
            },
            "security": undefined,
            "summary": undefined,
            "tags": undefined,
          },
        },
        "/router/router/procedure": Object {
          "get": Object {
            "description": undefined,
            "operationId": "router-router-procedure",
            "parameters": Array [
              Object {
                "description": undefined,
                "example": undefined,
                "in": "query",
                "name": "payload",
                "required": true,
                "schema": Object {
                  "type": "string",
                },
              },
            ],
            "requestBody": undefined,
            "responses": Object {
              "200": Object {
                "content": Object {
                  "application/json": Object {
                    "example": undefined,
                    "schema": Object {
                      "additionalProperties": false,
                      "properties": Object {
                        "payload": Object {
                          "type": "string",
                        },
                      },
                      "required": Array [
                        "payload",
                      ],
                      "type": "object",
                    },
                  },
                },
                "description": "Successful response",
                "headers": undefined,
              },
              "default": Object {
                "$ref": "#/components/responses/error",
              },
            },
            "security": undefined,
            "summary": undefined,
            "tags": undefined,
          },
        },
      }
    `);
  });

  test('with multiple inputs', () => {
    const appRouter = t.router({
      query: t.procedure
        .meta({ openapi: { method: 'GET', path: '/query' } })
        .input(z.object({ id: z.string() }))
        .input(z.object({ payload: z.string() }))
        .output(z.object({ id: z.string(), payload: z.string() }))
        .query(({ input }) => ({ id: input.id, payload: input.payload })),
      mutation: t.procedure
        .meta({ openapi: { method: 'POST', path: '/mutation' } })
        .input(z.object({ id: z.string() }))
        .input(z.object({ payload: z.string() }))
        .output(z.object({ id: z.string(), payload: z.string() }))
        .mutation(({ input }) => ({ id: input.id, payload: input.payload })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/query']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "id",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "payload",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/mutation']!.post!.requestBody).toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "id": Object {
                  "type": "string",
                },
                "payload": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "id",
                "payload",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
  });

  test('with content types', () => {
    {
      const appRouter = t.router({
        withNone: t.procedure
          .meta({ openapi: { method: 'POST', path: '/with-none', contentTypes: [] } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => ({ payload: input.payload })),
      });

      expect(() => {
        generateOpenApiDocument(appRouter, defaultDocOpts);
      }).toThrowError('[mutation.withNone] - At least one content type must be specified');
    }
    {
      const appRouter = t.router({
        withUrlencoded: t.procedure
          .meta({
            openapi: {
              method: 'POST',
              path: '/with-urlencoded',
              contentTypes: ['application/x-www-form-urlencoded'],
            },
          })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => ({ payload: input.payload })),
        withJson: t.procedure
          .meta({
            openapi: { method: 'POST', path: '/with-json', contentTypes: ['application/json'] },
          })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => ({ payload: input.payload })),
        withAll: t.procedure
          .meta({
            openapi: {
              method: 'POST',
              path: '/with-all',
              contentTypes: ['application/json', 'application/x-www-form-urlencoded'],
            },
          })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => ({ payload: input.payload })),
        withDefault: t.procedure
          .meta({ openapi: { method: 'POST', path: '/with-default' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => ({ payload: input.payload })),
      });

      const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

      expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
      expect(
        Object.keys((openApiDocument.paths['/with-urlencoded']!.post!.requestBody as any).content),
      ).toEqual(['application/x-www-form-urlencoded']);
      expect(
        Object.keys((openApiDocument.paths['/with-json']!.post!.requestBody as any).content),
      ).toEqual(['application/json']);
      expect(
        Object.keys((openApiDocument.paths['/with-all']!.post!.requestBody as any).content),
      ).toEqual(['application/json', 'application/x-www-form-urlencoded']);
      expect(
        (openApiDocument.paths['/with-all']!.post!.requestBody as any).content['application/json'],
      ).toEqual(
        (openApiDocument.paths['/with-all']!.post!.requestBody as any).content[
          'application/x-www-form-urlencoded'
        ],
      );
      expect(
        Object.keys((openApiDocument.paths['/with-default']!.post!.requestBody as any).content),
      ).toEqual(['application/json']);
    }
  });

  test('with deprecated', () => {
    const appRouter = t.router({
      deprecated: t.procedure
        .meta({ openapi: { method: 'POST', path: '/deprecated', deprecated: true } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/deprecated']!.post!.deprecated).toEqual(true);
  });

  test('with security schemes', () => {
    const appRouter = t.router({
      protected: t.procedure
        .meta({ openapi: { method: 'POST', path: '/protected', protect: true } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, {
      ...defaultDocOpts,
      securitySchemes: {
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    });

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.components!.securitySchemes).toEqual({
      ApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    });
    expect(openApiDocument.paths['/protected']!.post!.security).toEqual([{ ApiKey: [] }]);
  });

  test('with examples', () => {
    const appRouter = t.router({
      queryExample: t.procedure
        .meta({
          openapi: {
            method: 'GET',
            path: '/query-example/{name}',
            example: {
              request: { name: 'James', greeting: 'Hello' },
              response: { output: 'Hello James' },
            },
          },
        })
        .input(z.object({ name: z.string(), greeting: z.string() }))
        .output(z.object({ output: z.string() }))
        .query(({ input }) => ({
          output: `${input.greeting} ${input.name}`,
        })),
      mutationExample: t.procedure
        .meta({
          openapi: {
            method: 'POST',
            path: '/mutation-example/{name}',
            example: {
              request: { name: 'James', greeting: 'Hello' },
              response: { output: 'Hello James' },
            },
          },
        })
        .input(z.object({ name: z.string(), greeting: z.string() }))
        .output(z.object({ output: z.string() }))
        .mutation(({ input }) => ({
          output: `${input.greeting} ${input.name}`,
        })),
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/query-example/{name}']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": "James",
          "in": "path",
          "name": "name",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
        Object {
          "description": undefined,
          "example": "Hello",
          "in": "query",
          "name": "greeting",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/query-example/{name}']!.get!.responses[200])
      .toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": Object {
              "output": "Hello James",
            },
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "output": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "output",
              ],
              "type": "object",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
    expect(openApiDocument.paths['/mutation-example/{name}']!.post!.parameters)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": "James",
          "in": "path",
          "name": "name",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/mutation-example/{name}']!.post!.requestBody)
      .toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": Object {
              "greeting": "Hello",
            },
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "greeting": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "greeting",
              ],
              "type": "object",
            },
          },
        },
        "required": true,
      }
    `);
    expect(openApiDocument.paths['/mutation-example/{name}']!.post!.responses[200])
      .toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": Object {
              "output": "Hello James",
            },
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "output": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "output",
              ],
              "type": "object",
            },
          },
        },
        "description": "Successful response",
        "headers": undefined,
      }
    `);
  });

  test('with response headers', () => {
    const appRouter = t.router({
      queryExample: t.procedure
        .meta({
          openapi: {
            method: 'GET',
            path: '/query-example/{name}',
            responseHeaders: {
              "X-RateLimit-Limit": {
                description: "Request limit per hour.",
                schema: {
                  type: "integer"
                }
              },
              "X-RateLimit-Remaining": {
                description: "The number of requests left for the time window.",
                schema: {
                  type: "integer"
                }
              }
            }
          },
        })
        .input(z.object({ name: z.string(), greeting: z.string() }))
        .output(z.object({ output: z.string() }))
        .query(({ input }) => ({
          output: `${input.greeting} ${input.name}`,
        }))
    });

    const openApiDocument = generateOpenApiDocument(appRouter, defaultDocOpts);

    expect(openApiSchemaValidator.validate(openApiDocument).errors).toEqual([]);
    expect(openApiDocument.paths['/query-example/{name}']!.get!.parameters).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": undefined,
          "example": undefined,
          "in": "path",
          "name": "name",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
        Object {
          "description": undefined,
          "example": undefined,
          "in": "query",
          "name": "greeting",
          "required": true,
          "schema": Object {
            "type": "string",
          },
        },
      ]
    `);
    expect(openApiDocument.paths['/query-example/{name}']!.get!.responses[200])
      .toMatchInlineSnapshot(`
      Object {
        "content": Object {
          "application/json": Object {
            "example": undefined,
            "schema": Object {
              "additionalProperties": false,
              "properties": Object {
                "output": Object {
                  "type": "string",
                },
              },
              "required": Array [
                "output",
              ],
              "type": "object",
            },
          },
        },
        "description": "Successful response",
        "headers": Object {
          "X-RateLimit-Limit": Object {
            "description": "Request limit per hour.",
            "schema": Object {
              "type": "integer",
            },
          },
          "X-RateLimit-Remaining": Object {
            "description": "The number of requests left for the time window.",
            "schema": Object {
              "type": "integer",
            },
          },
        },
      }
    `);
  });
});
