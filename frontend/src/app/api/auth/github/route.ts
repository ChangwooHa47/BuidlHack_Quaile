import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/github?return=/projects/drift-layer/identity
 * Redirects user to GitHub OAuth authorization page.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "NEXT_PUBLIC_GITHUB_CLIENT_ID not set" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const state = crypto.randomUUID();
  let returnUrl = request.nextUrl.searchParams.get("return") || "/";
  if (!returnUrl.startsWith("/") || returnUrl.startsWith("//")) {
    returnUrl = "/";
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/github/callback`,
    scope: "read:user",
    state,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);
  response.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.set("github_oauth_return", returnUrl, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
