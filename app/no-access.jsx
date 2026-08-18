import { Callout, Stack } from "@al-rayhaanat/system";
import { CONSOLE_MODULE } from "../lib/console.js";

/**
 * What a screen shows to someone signed in who does not hold it.
 *
 * Named, not blank. A person refused here is almost always a colleague who
 * should have been granted something and was not, so the page says which
 * resource and which verb — that is exactly the cell somebody has to tick, and
 * "Forbidden" would send them to ask a question nobody can answer quickly.
 *
 * It deliberately does not offer a way to request access. That screen exists in
 * the plan, writes a row, and is worth building on purpose rather than
 * inventing here.
 */
export function NoAccess({ resource, action = "view", its }) {
  return (
    <Callout tone="warning" variant="card" title="You do not hold this screen">
      <Stack gap="3">
        <span>
          Opening it needs <strong>{action}</strong> on <strong>{resource}</strong>{" "}
          in <strong>{CONSOLE_MODULE}</strong>
          {its ? <> — and ITS {its} does not have it.</> : "."}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          It is granted on <strong>Permissions</strong>, against the access role you hold.
        </span>
      </Stack>
    </Callout>
  );
}
