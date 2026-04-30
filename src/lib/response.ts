import { NextResponse } from 'next/server';
import { ApiOk, ApiError } from '@/types';

export function ok<T>(data: T, status = 200): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function err(code: string, message: string, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
