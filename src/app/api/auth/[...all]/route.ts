import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  isAuthConfigured,
} from '@/server/auth/enabled';

const NOT_CONFIGURED_STATUS = 503;

const notConfigured = () =>
  NextResponse.json(
    { error: AUTH_NOT_CONFIGURED_MESSAGE },
    { status: NOT_CONFIGURED_STATUS }
  );

export const GET = (req: Request) =>
  isAuthConfigured ? toNextJsHandler(getAuth()).GET(req) : notConfigured();

export const POST = (req: Request) =>
  isAuthConfigured ? toNextJsHandler(getAuth()).POST(req) : notConfigured();
