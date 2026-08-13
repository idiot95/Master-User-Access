# User Access

Who may open which module, and what they may do there. Identity comes from ITS
One Login; everything past the door is decided here.

Next.js 16 App Router, React 19, plain JSX, built on
[al-Rayhaanat](https://github.com/idiot95/rayhanat-design-system) — the same
shape as `office-console`, deliberately.

```sh
npm install
npm run vendor:ds     # only after pulling design-system changes
cp .env.example .env.local && $EDITOR .env.local
npm run dev                        # http://localhost:3300
```

## What it owns, and what it does not

```
directory       →  who exists                (people register + ITS One Login)
office-console  →  who holds which org role  (assignments, scoped, in Teable)
User Access     →  what a role may do        (modules × rights)   ← this app
```

**Org roles and assignments are read-only here.** `office-console` owns writing
them, and this app links out rather than duplicating — the same rule
office-console applies to the people register.

## The 10,000 / 1,000 rule

Everyone eligible passes through ITS One Login — 10,000+ people. Data is held for
perhaps 1,000. The two numbers must never converge, so an access role declares
**how** you belong rather than **who** belongs:

| `Membership` | Members are | Rows stored |
|---|---|---|
| **Everyone** | anyone who passes ITS and the eligibility filter | **zero** |
| **Org Role** | whoever currently holds that org role | **zero** — read from existing data |
| **Explicit** | people listed by ITS ID | one row each |

Only `Explicit` stores anyone. A baseline tier for 10,000 people costs no rows at
all. Not storing people you do not serve is the point, not a side effect.

## Two bases, two tokens

Access config lives in **`MOD-User Access`**, apart from the office data it
governs, so the office base can be rebuilt, re-imported or handed to someone
else without disturbing who can open what.

| | Base | Token | May |
|---|---|---|---|
| Access config | `MOD-User Access` | `TEABLE_TOKEN` | read + write records |
| People, roles, assignments | `_DA Master` | `TEABLE_OFFICE_TOKEN` | **read only** |

A Teable token carries scopes **and an explicit base list**, and the scopes
apply across every base on that list — so one token able to write access rows
could also rewrite the office register. Splitting them makes *"this app never
writes org data"* true at the credential rather than only in the code, and a bug
fails with a 403 instead of corrupting the register.

Teable has no cross-base links, which is a constraint that happens to enforce
the separation. Two references changed shape when the tables moved, and neither
is a loss:

- `Access Roles.Org Role` — was a link to `Roles`, now the role's **name as
  text**. The resolver always compared by title.
- `Access Members.Person` — dropped. `ITS ID` was always the key, and a link
  that only works for the 125 people in the register is the wrong thing to
  depend on when most members will never be in it.

## Local or cloud, per base

The two bases need not be on the same Teable: `TEABLE_ACCESS_URL` and
`TEABLE_OFFICE_URL` are set independently, which is what a migration looks like
in practice. Both fall back to `TEABLE_URL` for the single-instance case. Which instance you are pointed at is shown permanently in the top
bar — granting rights against cloud while believing you are on local is the one
mistake worth spending fixed chrome to prevent.

### Schema work needs a different credential

Creating tables needs `table|create`, which a record-scoped app token does not
carry. `scripts/create-tables.mjs` accepts `TEABLE_COOKIE` pointing at a browser
cookie jar for that one-off. The app itself never reads it.

```sh
TEABLE_COOKIE=../teable-local/cookies.txt npm run tables
```

It is idempotent — run it twice and the second run reports `exists` for
everything and changes nothing. `--dry` prints what it would create.

## The five tables

| Table | Holds |
|---|---|
| `Modules` | the registry — key, URL, visibility, manifest state |
| `Access Roles` | in-house roles, and how membership is decided |
| `Access Members` | the ~1,000 explicitly provisioned, keyed on **ITS ID** |
| `Role Permissions` | the matrix — one row per (role, module, resource) |
| `Access Overrides` | person-level grants and denials, with reason and expiry |

`Access Members.Person` links to the office register but is **optional** — most
of the 1,000 will never be office attendees, and access must not require it.

## What a module must provide

Three things, and none of them is its data.

1. **A manifest** at `/.well-known/access-manifest.json` — a static file declaring
   its resources, the verbs each actually supports, and its scope dimensions. The
   matrix renders from this, so a module that has not declared itself shows no
   checkboxes rather than guessed ones.
2. **Scope endpoints**, only for dimensions it owns: `/.well-known/access-scopes/{key}`
   returning ids and labels, never row content. Authenticated — labels can be
   people's names.
3. **The gate** — `@al-rayhaanat/access` in `proxy.js`, and `requireAccess` on
   every write. The client gate is UX; the server gate is security.

   ```js
   // proxy.js — middleware.js on Next 15
   import { accessProxy, accessMatcher } from "@al-rayhaanat/access/proxy";
   export default accessProxy({ module: "hoto" });
   export const config = { matcher: accessMatcher };
   ```

A resource lists **only the verbs it has**. office-console has no delete path
anywhere, so its manifest omits `delete` and no delete column is drawn for it.
A checkbox for an operation a module cannot perform implies a control that does
not exist.

`source: "teable"` is valid **only** when the module stores record ids from this
base. A similarly-named field is not enough: hoto's `Jamiat` is free text, so a
`recABC` scope id would never match and its dimensions must be `self`.

## Layout

| Path | Does |
|---|---|
| `lib/teable.js` | the only place that talks to Teable; `server-only`, so the token cannot reach the browser |
| `lib/model.js` | the access domain. Resolves table ids by name, so a rebuilt base still works |
| `lib/resolve.js` | the decision logic — **pure**, no I/O, so precedence can be tested exhaustively |
| `lib/access.js` | the reads, and the bridge from ITS ID to org roles |
| `lib/manifest.js` | fetch, validate, hash and diff manifests |
| `lib/auth.js` | who you are, for 12 hours. A stopgap until ITS One Login |
| `lib/envelope.js` | what you may do, for 15 minutes. RS256, signed here and verified everywhere |
| `lib/redirect.js` | where `/authorize` is willing to send you afterwards — **pure**, and the only place an attacker picks a URL |
| `proxy.js` | no session, no console. Strips inbound `x-its-*` and sets it from the cookie |
| `app/authorize/route.js` | the door modules send people to. The only place an envelope is minted |
| `app/actions.js` | every write, as Server Actions, each followed by `revalidateTag` |
| `app/*/page.jsx` | Server Components: fetch, then hand plain data to a client view |
| `app/*/view.jsx` | client views; every al-Rayhaanat component is `"use client"` |

## Two tokens, two clocks

Identity and rights expire on different schedules, and folding them into one
cookie is how a session outlives the permissions it was issued under.

| | Cookie | Lives | Signed | Read by |
|---|---|---|---|---|
| Session | `ua_session` | 12 hours | HS256, `AUTH_SECRET` | this app only |
| Envelope | `da_access` | **15 minutes** | RS256, `ACCESS_PRIVATE_KEY` | every module, locally |

Fifteen minutes is the bound on how stale a module's view of someone's rights
can be. Tick a box on the matrix and it lands across the fleet within that, with
no deploy anywhere. Sign-in deliberately does not mint an envelope —
`/authorize` is the single place that happens, which is why the redirect
allow-list and the cookie-size check each exist once.

RS256 rather than a shared secret: every module verifies with the public half
from `/.well-known/jwks.json`, so a module whose environment leaks entirely
still cannot mint an envelope for another module.

```
   module has no envelope  →  /authorize?redirect=…
   no console session      →  /login, and back
   session                 →  resolve, sign, set cookie on .daeratulaqeeq.org, 303 home
```

`@al-rayhaanat/access` is the module side of this — the proxy gate, the
`requireAccess` check, and the scope filter. `docs/module-integration-prompt.md`
is the brief to hand whoever is wiring one up.

## Precedence

1. Public modules seed a bare view.
2. Union every non-orphaned grant for the role closure — two roles granting the
   same resource add up.
3. Grant overrides add.
4. **Deny overrides subtract, and always win.** No number of grants outvotes one
   deny, and a deny may narrow a scope rule but never widen it.
5. Anything left empty is dropped. **No entry means no access.**

A deny naming no resource and ticking no verb is a full lockout for that module.

## Seeing the matrix work before anything is deployed

The matrix renders from live manifests, so until the modules are on
`*.daeratulaqeeq.org` every column reads *not declared* — which is honest, but
makes it hard to try. Explorer's manifest already exists in the repo, so serve
it locally and point the module row at it:

```sh
(cd ../teable-local/explorer && python3 -m http.server 3400 --bind 127.0.0.1)
# then set the explorer module's URL to http://127.0.0.1:3400 and press
# "Fetch manifest" on /modules
```

Set the URL back before anyone else uses the console.

## Testing

```sh
npm test          # 83 cases, no network, no base
```

The one that matters most resolves an ITS ID present in no table and asserts a
valid `recognised` envelope **and that no row was written**. That is the
10,000/1,000 guarantee; it is a test rather than a habit.

`test/contract.test.js` is the other one to know about. It runs the resolver,
signs the result, and reads it back through the **vendored**
`@al-rayhaanat/access` — the code a module actually imports. The two halves live
in different repositories and can drift apart on a renamed short key, a changed
cookie name or an issuer that stops matching. Each of those looks fine on its
own side and locks the fleet out in production.

### Raw versus shaped reads

`lib/model.js` exposes the five access tables shaped into plain objects, but
`Role Assignments` and `DA Office Attendees` **raw**. That is deliberate: a link
cell is `{id, title}`, and a person must be matched on `.id`. Matching on the
title would make two people with the same name one identity — a permission bug
that reads like a typo.

## Nothing renders in `curl`

`AppShell` wraps its children in `FadeIn`, which starts hidden and reveals in a
`useEffect`. Server HTML therefore has an empty `<main>` by design. To check a
page from the command line, read the props in the RSC payload rather than the
markup, or use a browser.
