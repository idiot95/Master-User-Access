/**
 * Generate the envelope signing pair.
 *
 *   node scripts/generate-keys.mjs           # printed ready to paste
 *   node scripts/generate-keys.mjs --env     # as .env.local lines, one-line PEMs
 *
 * RS256, 2048 bits. The private half signs, here and nowhere else; the public
 * half is served at /.well-known/jwks.json and every module verifies with it.
 * Nothing to distribute by hand — that is the point of the asymmetric pair.
 *
 * Run it again to rotate. Envelopes live fifteen minutes, so the old key stops
 * mattering a quarter of an hour after the new one is deployed.
 */

import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";

const asEnv = process.argv.includes("--env");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** RFC 7638 thumbprint — the same kid the app computes, so you can eyeball a match. */
const jwk = createPublicKey(publicKey).export({ format: "jwk" });
const kid = createHash("sha256")
  .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
  .digest("base64url");

if (asEnv) {
  const oneLine = (pem) => pem.trim().replace(/\n/g, "\\n");
  console.log(`ACCESS_PRIVATE_KEY="${oneLine(privateKey)}"`);
  console.log(`ACCESS_PUBLIC_KEY="${oneLine(publicKey)}"`);
  console.log(`# kid (computed, no need to set): ${kid}`);
} else {
  console.log("ACCESS_PRIVATE_KEY — this app only, never a module:\n");
  console.log(privateKey);
  console.log("ACCESS_PUBLIC_KEY — safe anywhere, and published at /.well-known/jwks.json:\n");
  console.log(publicKey);
  console.log(`kid: ${kid}   (computed from the key; ACCESS_KEY_ID only overrides it)`);
  console.log("\nPaste both into .env.local, or re-run with --env for one-line form.");
}
