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
| `TEABLE_OFFICE_URL` | `https://app.teable.io` | ⚠️ see §3 |
| `TEABLE_OFFICE_BASE` | the live `DA` base id | |
| `TEABLE_OFFICE_TOKEN` | a **read-only** token on that base | never `record|create` or `record|update` |
| `NPM_TOKEN` | GitHub PAT with `read:packages` | see §2 |

**Do not set `ARH_LOCAL` or `ALLOW_ITS_OVERRIDE`.** The first breaks module
resolution on a deployment; the second turns identity into a query parameter.
`ALLOW_ITS_OVERRIDE` is guarded twice — it also requires `NODE_ENV` to not be
production — but it has no business being there.

## 2. The design system will not install without a PAT

`@al-rayhaanat/*` is published to **GitHub Packages**, not npm. Locally it is
symlinked from a sibling checkout by `npm run link:ds`; on Vercel that checkout
does not exist, so the install fails on the first `import`.

Add an `.npmrc` at the repo root (it is gitignored, so create it in Vercel or
commit a variant that reads the env var):

```
@al-rayhaanat:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

and set `NPM_TOKEN` to a PAT with `read:packages`.

Then move `@al-rayhaanat/system` from `optionalDependencies` to `dependencies`
in `package.json`. It sits in `optional` precisely so local installs succeed
without the PAT — but on a deployment an optional dependency that fails to
install fails silently, and the app builds with no design system at all.

## 3. The office base must be on live before this can work

`TEABLE_OFFICE_URL` currently points at `http://127.0.0.1:3100` in local
development. **Vercel cannot reach that.** More importantly, the live `DA` base
does not yet contain `Roles` or `Role Assignments` — they exist only locally.

Until those two tables are on live:

- the **Org Role** membership path resolves to nothing
- every role that follows an org role grants nothing to anybody
- explicit members and `Everyone` still work

So a deployment made today would run, and would be quietly wrong for most
people. Push those two tables first. They are additive — live has neither, so
nothing there can be overwritten.

## 4. Domain

Put the deployment on a subdomain of the fleet's parent domain
(`access.daeratulaqeeq.org`). The session cookie is set on `.daeratulaqeeq.org`
so every module can read it; on a `*.vercel.app` host it cannot be shared, and
each module would need its own redirect flow.

## 5. After the first deploy

- Open **Modules** and press **Fetch manifest** on each one. Nothing appears on
  Permissions until a module has declared itself.
- Give each module owner the brief in `docs/module-integration-prompt.md`.
- Check **Overview**. It lists what is misconfigured rather than counting
  things, so an empty page there is the goal.

## What is not wired yet

The envelope is designed but not issued: `ACCESS_PRIVATE_KEY` / `ACCESS_PUBLIC_KEY`
and the `/.well-known/jwks.json` route are still to come, as is ITS One Login
itself. Today the console reads and writes access configuration; it does not yet
hand modules a signed session. `docs/module-integration-prompt.md` describes the
contract modules should build against so they are ready when it lands.
