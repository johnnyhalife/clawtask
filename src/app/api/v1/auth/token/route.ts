import { NextResponse } from 'next/server';

/**
 * GET /api/v1/auth/token
 * Returns the UI human token from env. Safe because Clawtask runs on a private network.
 * The frontend fetches this once on load and stores it in localStorage.
 */
export async function GET() {
  const token = process.env.CLAWTASK_UI_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'CLAWTASK_UI_TOKEN not set' } }, { status: 503 });
  }
  return NextResponse.json({ ok: true, data: { token } });
}
