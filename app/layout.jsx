/* The token stylesheet is imported once, at the root, exactly as the system says.
   It paints the document ground too, so this app needs no stylesheet of its own. */
import "@al-rayhaanat/system/tokens.css";
import { Chrome } from "./chrome.jsx";
import { target } from "../lib/teable.js";

export const metadata = {
  title: "User Access — Daeratul Aqeeq",
  description: "Who may open which module, and what they may do there.",
};

/**
 * Theme, direction and language are attributes on <html>, not React state —
 * the system reads them from here and needs no provider.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <Chrome target={target()}>{children}</Chrome>
      </body>
    </html>
  );
}
