import { TRPCError, initTRPC } from '@trpc/server';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import jwt from 'jsonwebtoken';
import { OpenApiMeta } from 'trpc-openapi';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';

import { Post, User, database } from './database';

const jwtSecret = uuid();

export type Context = {
  user: User | null;
  requestId: string;
};

const t = initTRPC
  .context<Context>()
  .meta<OpenApiMeta>()
  .create({
    errorFormatter: ({ error, shape }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR' && process.env.NODE_ENV === 'production') {
        return { ...shape, message: 'Internal server error' };
      }
      return shape;
    },
  });

export const createContext = async ({
  req,
  resHeaders,
}: // eslint-disable-next-line @typescript-eslint/require-await
FetchCreateContextFnOptions): Promise<Context> => {
  const requestId = uuid();
  resHeaders.set('x-request-id', requestId);
  // set CORS
  resHeaders.set('access-control-allow-origin', '*');
  resHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  resHeaders.set('access-control-allow-headers', 'Content-Type, Authorization');

  let user: User | null = null;

  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const userId = jwt.verify(token, jwtSecret) as string;
      if (userId) {
        user = database.users.find((_user) => _user.id === userId) ?? null;
      }
    }
  } catch (cause) {
    console.error(cause);
  }

  return { user, requestId };
};

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      message: 'User not found',
      code: 'UNAUTHORIZED',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const authRouter = t.router({
  register: publicProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/auth/register',
        tags: ['auth'],
        summary: 'Register as a new user',
      },
    })
    .input(
      z.object({
        email: z.string().email(),
        passcode: z.preprocess(
          (arg) => (typeof arg === 'string' ? parseInt(arg) : arg),
          z.number().min(1000).max(9999),
        ),
        name: z.string().min(3),
      }),
    )
    .output(
      z.object({
        user: z.object({
          id: z.string().uuid(),
          email: z.string().email(),
          name: z.string().min(3),
        }),
      }),
    )
    .mutation(({ input }) => {
      let user = database.users.find((_user) => _user.email === input.email);

      if (user) {
        throw new TRPCError({
          message: 'User with email already exists',
          code: 'UNAUTHORIZED',
        });
      }

      user = {
        id: uuid(),
        email: input.email,
        passcode: input.passcode,
        name: input.name,
      };

      database.users.push(user);

      return { user: { id: user.id, email: user.email, name: user.name } };
    }),
  login: publicProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/auth/login',
        tags: ['auth'],
        summary: 'Login as an existing user',
      },
    })
    .input(
      z.object({
        email: z.string().email(),
        passcode: z.preprocess(
          (arg) => (typeof arg === 'string' ? parseInt(arg) : arg),
          z.number().min(1000).max(9999),
        ),
      }),
    )
    .output(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const user = database.users.find((_user) => _user.email === input.email);

      if (!user) {
        throw new TRPCError({
          message: 'User with email not found',
          code: 'UNAUTHORIZED',
        });
      }
      if (user.passcode !== input.passcode) {
        throw new TRPCError({
          message: 'Passcode was incorrect',
          code: 'UNAUTHORIZED',
        });
      }

      return {
        token: jwt.sign(user.id, jwtSecret),
      };
    }),
});

const usersRouter = t.router({
  getUsers: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users',
        tags: ['users'],
        summary: 'Read all users',
      },
    })
    .input(z.void())
    .output(
      z.object({
        users: z.array(
          z.object({
            id: z.string().uuid(),
            email: z.string().email(),
            name: z.string(),
          }),
        ),
      }),
    )
    .query(() => {
      const users = database.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
      }));

      return { users };
    }),
  getUserById: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/{id}',
        tags: ['users'],
        summary: 'Read a user by id',
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        user: z.object({
          id: z.string().uuid(),
          email: z.string().email(),
          name: z.string(),
        }),
      }),
    )
    .query(({ input }) => {
      const user = database.users.find((_user) => _user.id === input.id);

      if (!user) {
        throw new TRPCError({
          message: 'User not found',
          code: 'NOT_FOUND',
        });
      }

      return { user };
    }),
});

const postsRouter = t.router({
  getPosts: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/posts',
        tags: ['posts'],
        summary: 'Read all posts',
      },
    })
    .input(
      z.object({
        userId: z.string().uuid().optional(),
      }),
    )
    .output(
      z.object({
        posts: z.array(
          z.object({
            id: z.string().uuid(),
            content: z.string(),
            userId: z.string().uuid(),
          }),
        ),
      }),
    )
    .query(({ input }) => {
      let posts: Post[] = database.posts;

      if (input.userId) {
        posts = posts.filter((post) => {
          return post.userId === input.userId;
        });
      }

      return { posts };
    }),
  getPostById: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/posts/{id}',
        tags: ['posts'],
        summary: 'Read a post by id',
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        post: z.object({
          id: z.string().uuid(),
          content: z.string(),
          userId: z.string().uuid(),
        }),
      }),
    )
    .query(({ input }) => {
      const post = database.posts.find((_post) => _post.id === input.id);

      if (!post) {
        throw new TRPCError({
          message: 'Post not found',
          code: 'NOT_FOUND',
        });
      }

      return { post };
    }),
  createPost: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/posts',
        tags: ['posts'],
        protect: true,
        summary: 'Create a new post',
      },
    })
    .input(
      z.object({
        content: z.string().min(1).max(140),
      }),
    )
    .output(
      z.object({
        post: z.object({
          id: z.string().uuid(),
          content: z.string(),
          userId: z.string().uuid(),
        }),
      }),
    )
    .mutation(({ input, ctx }) => {
      const post: Post = {
        id: uuid(),
        content: input.content,
        userId: ctx.user.id,
      };

      database.posts.push(post);

      return { post };
    }),
  updatePostById: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/posts/{id}',
        tags: ['posts'],
        protect: true,
        summary: 'Update an existing post',
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().min(1),
      }),
    )
    .output(
      z.object({
        post: z.object({
          id: z.string().uuid(),
          content: z.string(),
          userId: z.string().uuid(),
        }),
      }),
    )
    .mutation(({ input, ctx }) => {
      const post = database.posts.find((_post) => _post.id === input.id);

      if (!post) {
        throw new TRPCError({
          message: 'Post not found',
          code: 'NOT_FOUND',
        });
      }
      if (post.userId !== ctx.user.id) {
        throw new TRPCError({
          message: 'Cannot edit post owned by other user',
          code: 'FORBIDDEN',
        });
      }

      post.content = input.content;

      return { post };
    }),
  deletePostById: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/posts/{id}',
        tags: ['posts'],
        protect: true,
        summary: 'Delete a post',
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .output(z.null())
    .mutation(({ input, ctx }) => {
      const post = database.posts.find((_post) => _post.id === input.id);

      if (!post) {
        throw new TRPCError({
          message: 'Post not found',
          code: 'NOT_FOUND',
        });
      }
      if (post.userId !== ctx.user.id) {
        throw new TRPCError({
          message: 'Cannot delete post owned by other user',
          code: 'FORBIDDEN',
        });
      }

      database.posts = database.posts.filter((_post) => _post !== post);

      return null;
    }),
});

export const appRouter = t.router({
  auth: authRouter,
  users: usersRouter,
  posts: postsRouter,
});

export type AppRouter = typeof appRouter;
