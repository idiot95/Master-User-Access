import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedRedirect, safeRedirect } from "../lib/redirect.js";

/**
 * `/authorize` takes a URL from whoever asks and sends a signed-in person to
 * it. Everything an open redirect is good for — a phishing page on a domain the
 * person has learned to trust, a token in a Referer header — starts with one of
 * the strings below being allowed by mistake.
 */

const fleet = {
  origin: "https://useraccess.daeratulaqeeq.org",
  cookieDomain: ".daeratulaqeeq.org",
  moduleUrls: ["https://hoto.daeratulaqeeq.org", "http://127.0.0.1:3400"],
};

test("a module on the fleet domain is allowed", () => {
  assert.equal(isAllowedRedirect("https://hoto.daeratulaqeeq.org/schedules/1448", fleet), true);
});

test("the parent domain itself is allowed", () => {
  assert.equal(isAllowedRedirect("https://daeratulaqeeq.org/", fleet), true);
});

test("back to the console is allowed", () => {
  assert.equal(isAllowedRedirect("https://useraccess.daeratulaqeeq.org/modules", fleet), true);
  assert.equal(isAllowedRedirect("/modules", fleet), true);
});

test("a registered module off the fleet domain is allowed", () => {
  // This is what makes local development work: 127.0.0.1 is allowed because an
  // administrator put it on a registry row, not because localhost is special.
  assert.equal(isAllowedRedirect("http://127.0.0.1:3400/", fleet), true);
  assert.equal(isAllowedRedirect("http://127.0.0.1:3999/", fleet), false);
});

test("somewhere else entirely is refused", () => {
  assert.equal(isAllowedRedirect("https://evil.example/login", fleet), false);
});

test("a lookalike domain is refused", () => {
  // The suffix test must be on a dot boundary, or every domain someone can
  // register ending in the right letters becomes part of the fleet.
  assert.equal(isAllowedRedirect("https://notdaeratulaqeeq.org/", fleet), false);
  assert.equal(isAllowedRedirect("https://daeratulaqeeq.org.evil.example/", fleet), false);
});

test("a credentialled URL pointing elsewhere is refused", () => {
  // Reads as the fleet host to a person skimming the address bar; the browser
  // sends them to evil.example.
  assert.equal(
    isAllowedRedirect("https://useraccess.daeratulaqeeq.org@evil.example/", fleet), false);
});

test("a scheme that is not the web is refused", () => {
  assert.equal(isAllowedRedirect("javascript:alert(1)", fleet), false);
  assert.equal(isAllowedRedirect("data:text/html,<script>alert(1)</script>", fleet), false);
});

test("a protocol-relative URL is not treated as a path", () => {
  // `//evil.example` resolves against the origin to https://evil.example — the
  // classic way a "starts with a slash, so it must be local" check is beaten.
  assert.equal(isAllowedRedirect("//evil.example/", fleet), false);
});

test("nonsense is refused rather than thrown", () => {
  assert.equal(isAllowedRedirect("", fleet), false);
  assert.equal(isAllowedRedirect("http://[", fleet), false);
});

test("a malformed registry URL does not take the check down with it", () => {
  const messy = { ...fleet, moduleUrls: ["not a url at all", "https://hoto.daeratulaqeeq.org"] };
  assert.equal(isAllowedRedirect("https://hoto.daeratulaqeeq.org/", messy), true);
});

test("with no fleet domain configured, only the console and registered modules pass", () => {
  const dev = { origin: "http://localhost:3300", cookieDomain: "", moduleUrls: ["http://127.0.0.1:3400"] };
  assert.equal(isAllowedRedirect("http://localhost:3300/roles", dev), true);
  assert.equal(isAllowedRedirect("http://127.0.0.1:3400/", dev), true);
  assert.equal(isAllowedRedirect("https://hoto.daeratulaqeeq.org/", dev), false);
});

test("a refused target falls back to the console rather than erroring", () => {
  assert.equal(safeRedirect("https://evil.example/", fleet), "/");
  assert.equal(safeRedirect(null, fleet), "/");
  assert.equal(
    safeRedirect("https://hoto.daeratulaqeeq.org/schedules", fleet),
    "https://hoto.daeratulaqeeq.org/schedules");
});
