"use client";

import { useState } from "react";
import {
  MarketingShell, Stack, Cluster, Card, Button, Input, Label, Callout, Mark, Icon,
} from "@al-rayhaanat/system";

/**
 * The front door.
 *
 * Deliberately plain: an ITS ID, a password, and no hint about which of the two
 * was wrong. Telling those apart hands anyone a way to enumerate who exists.
 *
 * This checks the `Auth Store` table the directory already writes, and is a
 * stopgap — ITS One Login is the intended front door. It says so out loud,
 * because a temporary thing that does not announce itself becomes permanent.
 */
export function LoginView({ next, secretMissing }) {
  const [itsId, setIts] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const valid = /^\d{6,10}$/.test(itsId.trim()) && password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itsId: itsId.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.detail ? `${data.error} ${data.detail}` : (data.error || "Could not sign in."));
        setBusy(false);
        return;
      }
      // Full navigation rather than a router push: the session cookie was just
      // set, and every page below reads it server-side.
      location.assign(next && next.startsWith("/") ? next : "/");
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  return (
    <MarketingShell>
      <div style={{ display: "grid", placeItems: "center", minBlockSize: "70dvh" }}>
        <div style={{ inlineSize: "100%", maxInlineSize: "26rem" }}>
          <Stack gap="6">
            <Stack gap="3" align="center">
              <Mark size={40} />
              <h1 style={{ margin: 0, fontFamily: "var(--font-display)",
                fontSize: "var(--text-2xl)", fontWeight: "var(--weight-regular)" }}>
                User Access
              </h1>
            </Stack>

            {secretMissing && (
              <Callout tone="danger" variant="card" title="AUTH_SECRET is not set">
                <code>openssl rand -base64 48</code>, add it to the environment, redeploy.
              </Callout>
            )}

            <Card>
              <form onSubmit={submit}>
                <Stack gap="4">
                  <Stack gap="2">
                    <Label htmlFor="itsId">ITS ID</Label>
                    <Input id="itsId" name="itsId" value={itsId}
                      onChange={(e) => setIts(e.target.value)}
                      inputMode="numeric" autoComplete="username" autoFocus
                      placeholder="8 digits" disabled={busy || secretMissing} />
                  </Stack>

                  <Stack gap="2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password" disabled={busy || secretMissing} />
                  </Stack>

                  {error && (
                    <Cluster gap="2" align="flex-start">
                      <Icon name="x" size={14} style={{ color: "var(--danger)", marginBlockStart: 2 }} />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--danger)" }}>{error}</span>
                    </Cluster>
                  )}

                  <Button type="submit" block loading={busy} disabled={!valid || secretMissing}>
                    Sign in
                  </Button>
                </Stack>
              </form>
            </Card>

          </Stack>
        </div>
      </div>
    </MarketingShell>
  );
}
