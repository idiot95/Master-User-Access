# @al-rayhaanat/access

The module side of [User Access](https://useraccess.daeratulaqeeq.org). The console
decides who may do what; this verifies that decision inside your module.

```sh
npm i @al-rayhaanat/access      # or vendor it, as the fleet currently does
```

## Three lines, in three places

**1. The gate** — `proxy.js` at the project root (`middleware.js` on Next 15):

```js
import { accessProxy, accessMatcher } from "@al-rayhaanat/access/proxy";

export default accessProxy({ module: "hoto" });
export const config = { matcher: accessMatcher };
```

**2. Every write** — inside the route or Server Function, never only in the proxy:

```js
import { requireAccess } from "@al-rayhaanat/access";

export async function POST(request) {
  const access = await requireAccess({ module: "hoto", resource: "schedule", action: "edit" });
  // …access.its is who did it
}
```

**3. Every scoped read** — if you declared a dimension, filter on it:

```js
const { rule, values } = await scopeFilter({ module: "hoto", resource: "schedule", dimension: "jamiat" });
if (rule !== "all") rows = rows.filter((r) => values.includes(r.jamiat));
```

Set `ACCESS_MODULE=hoto` and `module:` can be left off all of them.

## Why both a gate and a check

The proxy runs before Next has chosen a route. It knows the module and nothing
else — not the resource, not the verb, not which jamiat. It answers one
question: may this person reach this module at all.

`requireAccess` is the security boundary. Two things make skipping it a mistake
rather than an optimisation:

- **Server Functions are POSTs to whichever route they were used on.** Move one,
  or narrow the matcher, and the gate silently stops covering it. Next's own
  documentation says to check inside the function.
- **Hiding a button is a courtesy.** If the route does not check, the button may
  as well not exist.

## Environment

| Variable | Default | |
|---|---|---|
| `ACCESS_CONSOLE_URL` | `https://useraccess.daeratulaqeeq.org` | where to fetch JWKS and send people to sign in |
| `ACCESS_MODULE` | — | your module key, so `module:` can be omitted |
| `ACCESS_ISSUER` | `ACCESS_CONSOLE_URL` | only if the console signs under a different name |
| `ACCESS_PUBLIC_KEY` | — | pin the key instead of fetching JWKS |
| `ACCESS_SCOPE_TOKEN` | — | your own; the bearer your scope endpoints require |

**No secret of the console's ever appears here.** Verification uses the public
half, so a module cannot mint an envelope even if its whole environment leaks.
That is the reason for RS256 over a shared secret.

Pinning `ACCESS_PUBLIC_KEY` removes the JWKS fetch entirely — no network on any
path — at the cost of a redeploy when the key rotates. Left unset, JWKS is
cached for five minutes and rotation is automatic.

## What the envelope holds

```js
{
  its: "30411786",
  name: "…",
  tier: "steward",                       // recognised | member | steward | admin
  mods: {
    hoto: { res: { schedule: {
      v: 1, c: 0, e: 1, d: 0,            // view create edit delete
      rule: "own",                        // all | own | none
      caps: ["import_year"],
      scopes: [{ t: "jamiat", id: "recABC", l: "Ahmedabad" }],
    } } },
  },
}
```

Fifteen minutes, then the browser is bounced through `/authorize` for a fresh
one. That is the bound on how stale your view of someone's rights can be — a
revocation lands within a quarter of an hour, everywhere, with no deploy.

## Scope, which is the part worth reading twice

| `rule` | Means |
|---|---|
| `all` | every value of every dimension |
| `own` | only the values in `scopes` |
| `none` | the grant carries no scope authority |

Call `allows()` or `requireAccess()` **without** `scope` and scoping is not
consulted — right for a module whose data is not partitioned. Call it **with**
one and `none` denies.

> A dimension you declare in your manifest and never filter on is a restriction
> that exists only in the console. Nothing here can detect that for you — say so
> in your handover if it is true today.

## Failures

`requireAccess` throws `AccessDenied` with `.status` (401 with no envelope, 403
with one that does not permit it) and a message naming the resource and verb, so
whoever administers access is told what to tick rather than "Forbidden".

```js
try {
  await requireAccess({ resource: "schedule", action: "delete" });
} catch (e) {
  if (e instanceof AccessDenied) return Response.json({ error: e.message }, { status: e.status });
  throw e;
}
```

The proxy answers on its own: 401 to an API client with no envelope, a redirect
to the console for a browser, 403 when the envelope simply does not mention your
module — because a fresh one would say the same thing, and fetching it again is
how a permission problem becomes a redirect loop.

## Testing without a server

`@al-rayhaanat/access/verify` imports nothing from Next. Build an envelope
object by hand and assert against `allows()` — the whole decision layer is pure.

```js
import { allows } from "@al-rayhaanat/access/verify";

const envelope = { its: "1", tier: "member", mods: { hoto: { res: { schedule: { v: 1, rule: "none" } } } } };
allows(envelope, { module: "hoto", resource: "schedule", action: "view" });    // true
allows(envelope, { module: "hoto", resource: "schedule", action: "edit" });    // false
```
