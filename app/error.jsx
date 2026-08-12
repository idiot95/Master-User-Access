"use client";

import { Stack, Cluster, Card, Button, Callout, Icon } from "@al-rayhaanat/system";

/**
 * What a failed page says.
 *
 * Without this, Next shows an opaque digest number and nothing else — which is
 * exactly what happened on the first deployment: six unset environment
 * variables presented as "ERROR 802839193". The digest is still worth printing,
 * because it is the key to the server log, but it should never be the whole
 * message.
 *
 * The likely causes are listed in the order they actually occur, because the
 * person reading this is usually mid-deploy rather than debugging.
 */
export default function Error({ error, reset }) {
  const msg = String(error?.message || "");
  const isConfig = /not set|No base configured|TEABLE_/.test(msg);
  const isReach = /fetch failed|ECONNREFUSED|ENOTFOUND|127\.0\.0\.1|localhost/.test(msg);
  const isAuth = /403|401|not allowed|restricted_resource/.test(msg);

  return (
    <Stack gap="5" style={{ maxInlineSize: "80ch" }}>
      <Cluster gap="3" align="center">
        <Icon name="bell" size={20} style={{ color: "var(--danger)" }} />
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)", fontWeight: "var(--weight-regular)" }}>
          This page could not load
        </h1>
      </Cluster>

      {isConfig && (
        <Callout tone="danger" variant="card" title="Configuration is incomplete">
          One of the Teable environment variables is missing. On Vercel they go in
          {" "}<strong>Project Settings → Environment Variables</strong>, and a redeploy is
          needed afterwards — new variables do not reach a build that already happened.
        </Callout>
      )}

      {!isConfig && isReach && (
        <Callout tone="danger" variant="card" title="Teable could not be reached">
          The address configured is not answering. If it points at
          {" "}<code>127.0.0.1</code> this is a deployment reading a local address — set
          {" "}<code>TEABLE_ACCESS_URL</code> and <code>TEABLE_OFFICE_URL</code> to
          {" "}<code>https://app.teable.io</code>.
        </Callout>
      )}

      {!isConfig && !isReach && isAuth && (
        <Callout tone="danger" variant="card" title="Teable refused the token">
          A Teable token carries scopes <em>and</em> an explicit list of bases. A token with
          every scope still returns 403 if the base is not on its list — check that this
          token names the base being read.
        </Callout>
      )}

      <Card>
        <Stack gap="2">
          <strong style={{ fontSize: "var(--text-sm)" }}>What the server said</strong>
          <code style={{ fontSize: "var(--text-xs)", whiteSpace: "pre-wrap",
            color: "var(--text-secondary)" }}>
            {msg || "No message was attached to the error."}
          </code>
          {error?.digest && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Reference <code>{error.digest}</code> — search the deployment's runtime logs
              for this to see the full trace.
            </span>
          )}
        </Stack>
      </Card>

      <Cluster gap="3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="secondary" onClick={() => location.assign("/")}>Overview</Button>
      </Cluster>
    </Stack>
  );
}
