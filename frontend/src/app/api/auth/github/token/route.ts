import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/github/token
 * Returns GitHub connection status from the HttpOnly cookie.
 *
 * NOTE: The token is included in the response so the client can forward it
 * to the TEE's /v1/attest endpoint. Ideally the TEE call should be proxied
 * server-side so the token never reaches the browser, but that requires a
 * larger refactor. The cookie is HttpOnly + SameSite=Strict, so only
 * same-origin JS can read this endpoint. XSS remains a risk — tracked for
 * post-MVP hardening.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("github_token")?.value;
  if (!token) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({ connected: true, token });
}

/**
 * DELETE /api/auth/github/token
 * Clears the GitHub token cookie.
 */
export async function DELETE() {
  const response = NextResponse.json({ connected: false });
  response.cookies.delete("github_token");
  return response;
}
