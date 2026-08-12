import { NextResponse } from "next/server";
import { records, title } from "../../../../lib/teable.js";
import { idOf, T, rawPeople } from "../../../../lib/model.js";
import { verifyPassword, issueSession, cookieOptions } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

/**
 * Sign in against the `Auth Store` table the directory already writes.
 *
 * Deliberately quiet about why a sign-in failed: "no such ITS ID" and "wrong
 * password" are the same message, because telling them apart hands an attacker
 * a list of who exists.
 *
 * There is no rate limiting here yet. The table holds four people and this is
 * an interim gate, but it is the obvious next thing if it lives longer than
 * intended.
 */
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const itsId = String(body.itsId ?? "").trim();
  const password = String(body.password ?? "");

  if (!/^\d{6,10}$/.test(itsId) || !password) {
    return NextResponse.json({ error: "Enter an ITS ID and password." }, { status: 400 });
  }

  let row, people;
  try {
    const table = await idOf(T.AUTH_STORE);
    const [rows, register] = await Promise.all([
      records(table, { tags: [`t:${T.AUTH_STORE}`] }),
      rawPeople().catch(() => []),
    ]);
    row = rows.find((r) => String(r.fields.itsId ?? "").trim() === itsId);
    people = register;
  } catch (e) {
    // Configuration or connectivity, not credentials — say so, because the
    // person typing cannot fix it and should not be told their password is wrong.
    return NextResponse.json(
      { error: "Could not reach the credential store.", detail: String(e.message || e) },
      { status: 503 });
  }

  const check = row
    ? await verifyPassword({
        password,
        salt: row.fields.salt,
        passwordHash: row.fields.passwordHash,
      })
    : { ok: false };

  if (!check.ok) {
    return NextResponse.json({ error: "That ITS ID and password do not match." }, { status: 401 });
  }

  const person = people.find((p) => String(p.fields?.["ITS ID"] ?? "").trim() === itsId);
  const name = person?.fields?.["Name"] ?? null;

  const token = await issueSession({ itsId, name });
  const res = NextResponse.json({
    ok: true,
    name,
    // Which hashing scheme matched, so AUTH_HASH_SCHEME can be pinned once and
    // the guessing stops. Harmless to return: it describes our own reading of a
    // hash, not the hash.
    scheme: check.matched,
  });
  res.cookies.set({ ...cookieOptions(), value: token });
  return res;
}
