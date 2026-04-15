import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/github/callback
 * GitHub redirects here with ?code=...&state=...
 * Exchanges code for access_token, stores in HttpOnly cookie, redirects back.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Verify state
  const savedState = request.cookies.get("github_oauth_state")?.value;
  if (!state || state !== savedState) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 500 });
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/auth/github/callback`,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.json({ error: tokenData.error || "Token exchange failed" }, { status: 400 });
  }

  // Validate return URL — must start with / and not //
  let returnUrl = request.cookies.get("github_oauth_return")?.value || "/";
  if (!returnUrl.startsWith("/") || returnUrl.startsWith("//")) {
    returnUrl = "/";
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(`${baseUrl}${returnUrl}`);

  // Store token in HttpOnly cookie — not in URL
  response.cookies.set("github_token", tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.delete("github_oauth_state");
  response.cookies.delete("github_oauth_return");
  return response;
}
