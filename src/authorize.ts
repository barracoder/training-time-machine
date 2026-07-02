#!/usr/bin/env node
/**
 * One-time OAuth helper. Opens the Strava consent page, catches the redirect
 * on localhost, exchanges the code for tokens, and prints the refresh token
 * to put in your environment as STRAVA_REFRESH_TOKEN.
 *
 * Usage: STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... npm run auth
 *
 * The app's "Authorization Callback Domain" on
 * https://www.strava.com/settings/api must be set to "localhost".
 */
import http from "node:http";
import { exec } from "node:child_process";

const PORT = Number(process.env.STRAVA_AUTH_PORT ?? 8723);
const SCOPES = process.env.STRAVA_SCOPES ?? "read,activity:read_all,profile:read_all";

const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET first (from https://www.strava.com/settings/api).",
  );
  process.exit(1);
}

const redirectUri = `http://localhost:${PORT}/callback`;
const authorizeUrl =
  "https://www.strava.com/oauth/authorize" +
  `?client_id=${clientId}` +
  "&response_type=code" +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  "&approval_prompt=force" +
  `&scope=${encodeURIComponent(SCOPES)}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const grantedScopes = url.searchParams.get("scope");
  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Authorization failed: ${error ?? "no code returned"}`);
    console.error(`Authorization failed: ${error ?? "no code returned"}`);
    process.exit(1);
  }

  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Token exchange failed (${tokenRes.status}): ${body}`);
    console.error(`Token exchange failed (${tokenRes.status}): ${body}`);
    process.exit(1);
  }

  const token = (await tokenRes.json()) as {
    refresh_token: string;
    athlete?: { firstname?: string; lastname?: string };
  };

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Authorized! You can close this tab and return to the terminal.");

  const name = [token.athlete?.firstname, token.athlete?.lastname]
    .filter(Boolean)
    .join(" ");
  console.log(`\nAuthorized${name ? ` as ${name}` : ""} with scopes: ${grantedScopes}`);
  console.log("\nAdd this to your MCP server environment:\n");
  console.log(`  STRAVA_CLIENT_ID=${clientId}`);
  console.log(`  STRAVA_CLIENT_SECRET=${clientSecret}`);
  console.log(`  STRAVA_REFRESH_TOKEN=${token.refresh_token}\n`);
  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening on ${redirectUri}`);
  console.log(`\nOpen this URL to authorize (attempting to open automatically):\n\n${authorizeUrl}\n`);
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${authorizeUrl}"`);
});
