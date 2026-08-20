# Retired — this console now lives inside DA Core

`useraccess.daeratulaqeeq.org` forwards to `https://www.daeratulaqeeq.org`.
Nothing here is deployed any more; the app remains only so its history is
readable.

## Where everything went

| This app served | Now served by |
|---|---|
| `/api/access/me`, `/explain`, `/modules` | Core, at the same paths |
| The permissions matrix, roles, members, overrides | Core → **Admin → User access** |
| The module registry | Core → **Admin → Modules** |
| Its own sign-in | Core's `/login` — one door for the whole fleet |

Its Teable base, `MOD-User Access`, is unchanged and is now written by core.
No grants, permission rows or members were deleted in the move; the
`user-access` row in `Modules` is marked **Retired** rather than removed, so
the record of what it held is still there.

## Why the redirects rather than a deleted project

A retired host that simply stops answering turns every bookmark, every link in
an old message and every module that was never repointed into a failure with no
explanation. Forwarding costs nothing and tells them where to go.

`/api/*` forwards too. A module that follows it reaches core and works; one
that treats a redirect as "not authenticated" — which the module contract says
to do — fails closed. Both are safe, and neither is silent.

## If you need to bring it back

The project's environment variables are intact on Vercel. Remove `redirects`
from `vercel.json` and redeploy. Note that core now holds the read-write token
for `MOD-User Access`, so two apps writing the same access base is the thing to
think about before doing that.

See `MODULE-CONTRACT.md` in the `da-core` repo for what modules integrate
against now.
