# Deploying to Vercel

Short answer to the usual question: **fetching manifests needs no environment
variable at all.** A manifest is a public file on the module's own origin, and
User Access fetches it over plain HTTPS. Nothing to paste.

The per-module bearer token for **scope endpoints** is not an env var either —
it lives in the `Manifest Token` field on that module's row in the `Modules`
table, so each module can have its own and you can rotate one without a deploy.

What you do need is below, and two of them will stop the build or the app if
they are missing.

---

## 1. Environment variables

| Variable | Value | Why |
|---|---|---|
| `TEABLE_ACCESS_URL` | `https://app.teable.io` | |
| `TEABLE_ACCESS_BASE` | `bseH8n0A8lqdJMistsz` | MOD-User Access |
| `TEABLE_TOKEN` | a token scoped to **that base only** | read + `record|create` + `record|update` |
| `TEABLE_OFFICE_URL` | `https://app.teable.io` | |
| `TEABLE_OFFICE_BASE` | `bseHKVLPadS6wPhefR8` | _DA Master |
| `TEABLE_OFFICE_TOKEN` | a **read-only** token on that base | never `record|create` or `record|update` |
| `DA_CORE_URL` | `https://core.daeratulaqeeq.org` | where sign-in happens. Set it and this app runs no auth of its own |
| `AUTH_SECRET` | `openssl rand -base64 48` | signs the interim local session. Unneeded once `DA_CORE_URL` is set |
| `ACCESS_PRIVATE_KEY` | from `npm run keys` | signs envelopes; this app and nowhere else |
| `ACCESS_PUBLIC_KEY` | the other half | served at `/.well-known/jwks.json` |
| `ACCESS_ISSUER` | `https://useraccess.daeratulaqeeq.org` | the `iss` modules check, and the return address given to core |
| `COOKIE_DOMAIN` | `.daeratulaqeeq.org` | so every module reads the same cookie |

That is the whole list. Three that must **not** be set:

- **`ALLOW_ITS_OVERRIDE`** turns identity into a query parameter. It is guarded
  twice, also requiring `NODE_ENV` to not be production, but it has no business
  on a deployment.
- **`TRUST_FORWARDED_ITS`** stops `proxy.js` stripping the inbound `x-its-id`
  header. `DA_CORE_URL` is not a reason to set it — core's token is verified
  here, in code. Without a gateway actually terminating identity in front of
  this app, that header is whatever the browser typed.
- **`ACCESS_KEY_ID`** is computed from the key itself. Setting it by hand is a
  way for the `kid` in a token to stop naming the key that signed it.

`ACCESS_ISSUER` is deliberately not derived from the request. On a preview
deployment the request origin is a `*.vercel.app` host, and an envelope claiming
that as its issuer is either rejected by every module or — worse — accepted, at
which point a preview build hands out production rights.

A single token covering both bases also works: `TEABLE_OFFICE_TOKEN` falls back
to `TEABLE_TOKEN` when unset. The cost is that the app could then write to the
office register, which nothing in it does — the split is what makes that true at
the credential rather than only in the code.

## 2. The design system is vendored — no token needed

`@al-rayhaanat/*` lives in `vendor/@al-rayhaanat`, referenced by `file:` paths,
so `npm install` resolves it from a clean clone with no registry and no PAT.

This is not the arrangement the design system's own README describes. That one
assumes the packages are published to GitHub Packages — but the Changesets
release workflow has never run (there are no tags), so `npm i
@al-rayhaanat/system` 404s with or without a token. Vendoring is what actually
builds today.

The cost is a fork: a fix committed to `rayhanat-design-system` does not reach
this app on its own. Pull it in deliberately:

```sh
npm run vendor:ds        # re-copy from ../rayhanat-design-system
npm install
```

The script rewrites each package's pnpm-only `workspace:*` ranges to relative
`file:` paths, which is the only edit it makes — so re-running it carries
upstream changes straight through.

If the packages are ever actually published, switching back is two lines: an
`.npmrc` pointing at `npm.pkg.github.com` with a `read:packages` PAT, and a
version range instead of the `file:` path.

## 3. Both bases are on live

`_DA Master` (`bseHKVLPadS6wPhefR8`) holds `Roles`, `Role Assignments` and
`DA Office Attendees`, so the Org Role membership path resolves fully against
live. Nothing has to be pushed before deploying.

One thing to know rather than fix: **`Role Assignments` is 231 on live and 314
locally.** Roles and the attendee register match exactly. Access resolves
correctly either way — but a person whose only current assignment is among those
83 will hold no org-role-derived access when the app reads live. Reconcile it
when convenient; it is not a deployment blocker.

## 4. Domain

`useraccess.daeratulaqeeq.org` — a subdomain of the fleet's parent domain, so
the envelope cookie on `.daeratulaqeeq.org` reaches every module, and core's
identity cookie reaches this one. On a `*.vercel.app` host neither can be
shared, and every module would need its own redirect flow.

## 5. After the first deploy

- Open **Modules** and press **Fetch manifest** on each one. Nothing appears on
  Permissions until a module has declared itself.
- Give each module owner the brief in `docs/module-integration-prompt.md`.
- Check **Overview**. It lists what is misconfigured rather than counting
  things, so an empty page there is the goal.

## The envelope, once it is deployed

```
person opens mawaqeet.daeratulaqeeq.org
  │
  ├─ no envelope cookie ──▶ useraccess.daeratulaqeeq.org/authorize?redirect=…
  │                           │
  │                           ├─ no identity ──▶ core.daeratulaqeeq.org/login,
  │                           │                  then back here
  │                           └─ identity ──▶ resolve, sign RS256, set cookie,
  │                                           303 back to where they were going
  │
  └─ envelope ──▶ verified locally against JWKS. No call to this app.
```

Two clocks, deliberately: identity is core's to expire, the envelope is 15 minutes.
Fifteen minutes is the bound on how stale a module's view of someone's rights
can be — tick a box on the matrix and it lands everywhere within that, with no
deploy anywhere. Signing out clears both, or a person would keep their rights
across the fleet for a quarter of an hour after leaving.

**Check after the first deploy:**

```sh
curl -s https://useraccess.daeratulaqeeq.org/.well-known/jwks.json
```

One key, `"alg":"RS256"`, `"use":"sig"`, and no `d` field. If it returns
`signing_key_not_configured`, the two `ACCESS_*` keys did not make it into the
environment.

### Rotating the key

`npm run keys`, paste the new pair, redeploy. Envelopes live fifteen minutes, so
the old key stops mattering a quarter of an hour later. Modules that fetch JWKS
pick the new one up on their own; any module that pinned `ACCESS_PUBLIC_KEY` in
its own environment needs a redeploy, which is the trade it made for never
touching the network.

## What is not wired yet

**The core DA module.** The seam is built and tested — `lib/upstream.js`
verifies core's token, `lib/identity.js` chooses between it and the local
session, and `proxy.js` sends anyone unrecognised to core rather than to
`/login`. Nothing downstream of `lib/session.js` changes either way.

What is not set is `DA_CORE_URL`, because core is not serving yet. Until it is,
the console falls back to `lib/auth.js` and the `Auth Store` table — four
people, salted SHA-256, no rate limiting, named a stopgap in the file itself.
Set the one variable and that path closes: `/login` redirects to core and
`POST /api/auth/login` answers 410, so it is shut at the route and not merely
hidden from the screen.

Core needs to serve `/.well-known/jwks.json` and set its cookie on
`.daeratulaqeeq.org` for this to work.
