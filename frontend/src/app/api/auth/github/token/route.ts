import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/github/token
 * Returns the GitHub token from the HttpOnly cookie.
 * Client calls this to check if GitHub is connected.
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
