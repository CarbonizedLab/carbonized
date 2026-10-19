import {
  NextComment,
  type NextCommentOptions,
} from '@fuma-comment/server/next';
import { NextResponse } from 'next/server';
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  isAuthConfigured,
} from '@/server/auth/enabled';
import {
  createCommentsAuth,
  createCommentsStorage,
} from '@/server/comments/config';

type Router = ReturnType<typeof NextComment>;
type Method = keyof Router;

const NOT_CONFIGURED_STATUS = 503;

let router: Router | undefined;

const getRouter = (): Router => {
  router ??= NextComment({
    // role: 'database', todo use role in auth
    mention: { enabled: true },
    auth: createCommentsAuth(),
    storage: createCommentsStorage(),
  } satisfies NextCommentOptions);
  return router;
};

const handle =
  (method: Method): Router[Method] =>
  (req, context) => {
    if (!isAuthConfigured) {
      return Promise.resolve(
        NextResponse.json(
          { error: AUTH_NOT_CONFIGURED_MESSAGE },
          { status: NOT_CONFIGURED_STATUS }
        )
      );
    }
    return getRouter()[method](req, context);
  };

export const GET = handle('GET');
export const POST = handle('POST');
export const PATCH = handle('PATCH');
export const DELETE = handle('DELETE');
