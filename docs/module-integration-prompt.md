# Brief: wire a module into User Access

**Give this whole file to the agent working on the module.** It is written to be
read by an AI agent with the module's codebase in front of it. Everything below
the line is addressed to that agent.

Works both ways: for an existing module, it produces the manifest and the
endpoints from the code that is already there; for a new one, it tells you what
to build so the module is grantable from the start.

---

## Your task

You are connecting **one module** to the Daeratul Aqeeq **User Access** console
(`MOD-User Access`). When you are done, an administrator can grant people access
to your module from one screen, at the level of individual resources and buttons,
without touching your code again.

Produce three things. The first is mandatory, the second only if your module has
scopes User Access cannot already see, the third is the actual enforcement.

### 1. A manifest — `public/.well-known/access-manifest.json`

A static file declaring what *can* be granted. User Access renders its matrix
from this, so a module that has not declared itself shows no checkboxes at all.

```json
{
  "manifestVersion": 1,
  "module": "hoto",
  "revision": "3",
  "generated": "2026-08-12T00:00:00Z",
  "name": { "en": "HOTO Schedules", "ar": "برنامج التسليم" },
  "resources": [
    {
      "key": "schedule",
      "label": "HOTO Schedule",
      "description": "One handover between two jamiats.",
      "vced": ["view", "create", "edit"],
      "capabilities": [
        { "key": "import_year",     "label": "Import a year from Excel" },
        { "key": "auto_schedule",   "label": "Auto-schedule open slots" },
        { "key": "notify_whatsapp", "label": "Send WhatsApp notification" },
        { "key": "reset_year",      "label": "Reset / overwrite a year" }
      ],
      "scopeDimensions": ["year", "jamiat", "musaedah"]
    }
  ],
  "scopeDimensions": [
    { "key": "year",     "label": "Hijri Year", "source": "self", "selfEndpoint": "/.well-known/access-scopes/year" },
    { "key": "jamiat",   "label": "Jamiat",     "source": "self", "selfEndpoint": "/.well-known/access-scopes/jamiat" },
    { "key": "musaedah", "label": "Musaedah",   "source": "self", "selfEndpoint": "/.well-known/access-scopes/musaedah" }
  ]
}
```

Validate against `user-access/schemas/access-manifest.json` (draft 2020-12).

### 2. Scope endpoints — only for dimensions you own

`GET /.well-known/access-scopes/{dimension}`

```json
{ "dimension": "year", "generated": "2026-08-12T00:00:00Z",
  "items": [ { "id": "1448H", "label": "1448H" }, { "id": "1447H", "label": "1447H" } ] }
```

**Identifiers and labels only. Never row content.** This exists so an admin can
pick "these three jamiats" from a real list instead of typing ids. It is called
when a picker opens — never on the request path — so if your module is down,
new grants wait but nobody's access breaks.

**These must be authenticated.** Labels are often people's names. Accept a
bearer token and reject anything else:

```ts
const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
if (!token || token !== process.env.ACCESS_SCOPE_TOKEN) return new Response('', { status: 401 });
```

Give that token to whoever administers User Access; it goes in the module's
`Manifest Token` field. The manifest itself stays public — it is vocabulary, and
it carries no authority.

### 3. The gate — `@al-rayhaanat/access`

The package is not published; the fleet vendors it, the same way this app
vendors the design system:

```sh
node scripts/vendor-design-system.mjs --from ../rayhanat-design-system
# then in package.json: "@al-rayhaanat/access": "file:vendor/@al-rayhaanat/access"
npm install
```

Two environment variables, neither of them a secret of the console's:

```sh
ACCESS_CONSOLE_URL=https://useraccess.daeratulaqeeq.org
ACCESS_MODULE=hoto        # so `module:` can be left off every call
```

**The gate** — `proxy.js` at the project root. Next 16 renamed `middleware` to
`proxy`; on Next 15 the file is `middleware.js` and the export is
`accessMiddleware`, which is the same function.

```js
import { accessProxy, accessMatcher } from '@al-rayhaanat/access/proxy';

export default accessProxy({ module: 'hoto' });
export const config = { matcher: accessMatcher };
```

It verifies the envelope locally — a signature check against a cached JWKS, no
call to the console on the request path — and sends anyone without one to
`/authorize` and back. It answers **one** question: may this person reach this
module at all. It runs before Next has chosen a route, so it cannot know which
resource or which verb your request is about.

**Every write** — inside the route or the Server Function:

```js
import { requireAccess, AccessDenied } from '@al-rayhaanat/access';

export async function POST(request) {
  const access = await requireAccess({ resource: 'schedule', action: 'edit' });
  // access.its is who did it — good enough for an audit column
}
```

`requireAccess` throws `AccessDenied` with `.status` (401 with no envelope, 403
with one that does not permit it) and a message naming the resource and the
verb, so whoever administers access is told what to tick rather than
"Forbidden".

**Every scoped read** — if you declared a dimension, filter on it:

```js
import { scopeFilter } from '@al-rayhaanat/access';

const { rule, values } = await scopeFilter({ resource: 'schedule', dimension: 'jamiat' });
if (rule === 'none') return [];                       // no scope authority at all
if (rule === 'own') rows = rows.filter((r) => values.includes(r.jamiat));
```

> **The client gate is UX. The server gate is security.** Hiding a button is a
> courtesy. If your API route does not check, the button may as well not exist.

One reason that is sharper than it sounds on Next: **a Server Function is a POST
to whichever route it was used on.** Move one, or narrow your matcher, and the
proxy silently stops covering it. Next's own documentation says to check inside
the function rather than rely on the proxy. So does this brief.

---

## How to derive the manifest — do not guess it

Read the code. The manifest is a description of what your module can actually
do, and every entry must trace to a real code path.

**1. Enumerate every write.** API routes with a non-GET method, server actions,
form handlers, anything that mutates storage. List them by name.

**2. Enumerate every read** that a person could be denied.

**3. Group them into resources.** A resource is a thing a person thinks about —
"a schedule", "a person", "a job description" — not a database table. If two
tables always move together, they are one resource.

**4. Map each to VCED, then stop.** `view` `create` `edit` `delete` — and
**declare only the ones you have a code path for.**

> This is the rule agents get wrong most often. If your module has no delete
> route, `delete` does not go in `vced`. A checkbox for an operation that cannot
> happen implies a control that does not exist, which is worse than showing
> nothing. Real example: `office-console` has creates and updates but no delete
> anywhere, so its manifest omits `delete` and the matrix draws no delete column
> for it.

**5. Everything that is not CRUD is a capability.** Buttons that publish,
import, send, reset, recalculate, go live. Give each a stable `key` and a label
an administrator will understand — the label is what they read when deciding
whether to tick it. Capability keys may not be named `view`, `create`, `edit` or
`delete`; the schema rejects that.

**6. Declare scope dimensions only if your data is genuinely partitioned** —
by jamiat, by year, by section, by channel.

### `source: "teable"` versus `source: "self"`

Use `"teable"` **only if your module stores the actual Teable record id from the
User Access office base** (`recXXXXXXXX`). A field with a similar name is not
enough.

- ✅ `office-console` stores real record ids from that base → `teable`
- ❌ `hoto` stores `Jamiat` as free text (`"Ahmedabad"`) → a `recABC` scope id
  would never match, so it must be `self` and serve its own values
- ❌ `safar` reads a different Teable base entirely → every dimension is `self`

Getting this wrong produces a grant that looks right in the console and silently
matches nothing. **If you are not certain your ids come from that exact base,
use `self`.**

---

## How the data reaches User Access

**Pull, not push.** You publish; User Access fetches. You never call it.

```
  module                                  User Access
  ──────                                  ───────────
  /.well-known/access-manifest.json  ──▶  every 15 min (cron), on demand
                                          ("Fetch manifest"), and whenever the
                                          matrix opens for your module

  /.well-known/access-scopes/{dim}   ──▶  only when an admin opens a scope
                                          picker. Cached 5 min. Authenticated.

  signed envelope (RS256 JWT)        ◀──  cookie on .daeratulaqeeq.org, 15 min,
                                          verified locally against JWKS
```

The envelope arrives as the `da_access` cookie, set by the console on the fleet's
parent domain. You never fetch it; the browser carries it. When it is missing or
expired, `accessProxy` bounces the person through
`https://useraccess.daeratulaqeeq.org/authorize?redirect=<where they were going>` and
they come back with a fresh one — no password, if their console session is still
alive.

Fifteen minutes is the bound on how stale your view of someone's rights can be.
A revocation lands everywhere within that, with no deploy on your side.

Three consequences worth knowing:

- **Your outage is not their outage.** Manifests are never read while resolving
  someone's access. If your module is unreachable, User Access keeps the last
  good manifest, marks you `Unreachable`, and leaves every existing grant intact.
- **Changing your manifest changes the console within 15 minutes**, with no
  deploy on their side.
- **Removing a resource or capability does not silently revoke.** Grants
  pointing at vocabulary you dropped are flagged *orphaned*, kept for the record,
  and excluded when access is resolved. If you rename a key, that reads as a
  delete plus an add — so **bump `revision` and tell the administrator**, or
  people quietly lose access.

---

## Ask, do not assume

Stop and ask the human when you hit any of these. Each one is a decision about
who can see whose data, and a wrong guess is invisible until it matters.

| Situation | Ask |
|---|---|
| A write path has no obvious owner | "Who should be able to do X — everyone with the module, or a specific role?" |
| Two resources always change together | "Should these be one grantable thing or two?" |
| A destructive action (reset, overwrite, bulk delete) | "Should this be its own capability so it can be withheld from people who otherwise have edit?" |
| Data looks partitioned but nothing enforces it | "Is this a real boundary that should be enforced, or just a filter?" |
| Scope ids might not come from the office base | "Do these ids come from the User Access Teable base, or are they ours?" |
| An existing role name has no match in the console | "Is *Imae Fatema* meant to be an access role, or just a label on a contact field?" |
| The module currently has no auth at all | "Who should be able to reach this at all, today, before we get granular?" |

Default to **fewer** verbs and **more** capabilities when unsure. Withholding
something someone needs produces a complaint; granting something they should not
have produces an incident.

---

## Verify before you hand it over

- [ ] The manifest validates against `schemas/access-manifest.json`.
- [ ] Every `vced` entry traces to a real code path. Name the file and function
      for each in your handover notes.
- [ ] No capability key is named `view`, `create`, `edit` or `delete`.
- [ ] Every `resource.scopeDimensions` entry names a declared dimension.
- [ ] Each `self` scope endpoint returns ids and labels **only**, and returns
      401 without a bearer token.
- [ ] `proxy.js` (or `middleware.js` on Next 15) calls `accessProxy`, and your
      matcher does not exclude a route a Server Function lives on.
- [ ] **Every write path calls `requireAccess` server-side.** List them and tick
      them off one by one.
- [ ] Scoped grants are actually applied to your queries. If you declare a
      dimension, your server must filter on it — a scope the module ignores is a
      restriction that exists only in the console.
- [ ] Removing a person's grant actually locks them out. Test it.

## Then register it

Give the User Access administrator:

1. The module **key** (`hoto`) — lowercase, stable, never changed after this.
2. The **URL** the manifest is served from.
3. The **scope token**, if you added scope endpoints.
4. A note of anything you had to ask about, and what was decided.

They add the row on **Modules**, press **Fetch manifest**, and your resources
appear in the matrix. Nothing is granted until someone ticks it — an absent row
is a denial, which is the safe direction to be wrong in.

---

## Two real cases

**A module with no server** (`explorer` — a static page). One resource,
view-only, no scopes. The manifest is a static file in `public/`, and Vercel
runs `proxy.js` on static deployments, so the gate is the same one-liner.
Its data is embedded in the HTML, so gating delivery gates the data.

```json
{ "manifestVersion": 1, "module": "explorer", "revision": "1",
  "generated": "2026-08-11T00:00:00Z",
  "resources": [{ "key": "base_snapshot", "label": "Office Base Snapshot", "vced": ["view"] }],
  "scopeDimensions": [] }
```

**A module whose scoping does not work yet** (`hoto`). `GET /api/schedules`
returns every jamiat's records and the browser filters afterwards. You may still
declare the `jamiat` dimension — but until the server filters on it, a grant of
"own scope, Talabat only" is advisory. **Say so in the handover.** User Access
publishes an authentic scope list; it cannot make your module honour it.
