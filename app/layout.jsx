/* The token stylesheet is imported once, at the root, exactly as the system says.
   It paints the document ground too, so this app needs no stylesheet of its own. */
import "@al-rayhaanat/system/tokens.css";
import { cookies } from "next/headers";
import { Chrome } from "./chrome.jsx";
import { target } from "../lib/teable.js";
import { readIdentity } from "../lib/identity.js";
import { consoleAccess, viewable } from "../lib/console.js";

export const metadata = {
  title: "User Access — Daeratul Aqeeq",
  description: "Who may open which module, and what they may do there.",
};

/**
 * Theme, direction and language are attributes on <html>, not React state —
 * the system reads them from here and needs no provider.
 */
export default async function RootLayout({ children }) {
  const jar = await cookies();
  // Core's token when core is configured, the interim local session when not.
  // Either way a failure to read one is "not signed in", never a 500 — the
  // layout must not take the whole site down over a missing secret.
  const session = await readIdentity((name) => jar.get(name)?.value);

  // Which screens to list. Resolving it here costs one cached read and saves
  // every page offering links that will refuse the person who clicks them.
  // A failure is not fatal: the nav falls back to Overview alone, and each
  // page still gates itself.
  const rights = session
    ? await consoleAccess().then(viewable).catch(() => ({}))
    : {};

  return (
    <html lang="en" dir="ltr">
      <body>
        <Chrome target={target()} session={session} viewable={rights}>{children}</Chrome>
      </body>
    </html>
  );
}
