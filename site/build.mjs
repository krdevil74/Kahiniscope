/**
 * Build the public policy pages.
 *
 * Play rejects a listing without a privacy policy at a public URL, and — for
 * any app whose users can create an account — without a page saying how to
 * delete one. Both have to stay true as the app changes, so both are
 * generated from the markdown in `mobile/store/` rather than written twice:
 * there is one copy of each text, and the published page is a view of it.
 *
 * The support address is substituted here rather than typed into the
 * markdown, so it lives in exactly one place and a change to it cannot leave
 * one of the two mentions stale.
 *
 *   node site/build.mjs        # writes site/dist/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The address on the listing and in the policy. Public by definition.
 *
 * Deliberately not the owner account that administers the app: publishing
 * that one invites attempts at the single login that can approve members,
 * assign work and move money.
 */
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "";

if (!SUPPORT_EMAIL) {
  throw new Error(
    "SUPPORT_EMAIL is not set. The policy must carry a real contact address " +
      "before it is published — Play requires one, and a page that says " +
      "'<support address>' is worse than no page."
  );
}

/** Read one markdown source and put the real contact address into it. */
async function textOf(file) {
  const source = await readFile(join(root, "mobile/store", file), "utf8");
  const body = source
    // The instruction to whoever fills this in is for the repository, not for
    // the public page.
    .replace(/^> Fill this in before publishing[\s\S]*?\n\n/m, "")
    .replaceAll("<support address>", SUPPORT_EMAIL);

  if (body.includes("<support address>")) {
    throw new Error(`A placeholder survived substitution in ${file}.`);
  }
  return body;
}

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 5rem;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1b1b2b;
    background: #fff;
  }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .5rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 .6rem; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
  th, td { border: 1px solid #dadae4; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f7; }
  code { background: #f4f4f7; padding: .1em .35em; border-radius: 3px; }
  a { color: #7b3fd4; }
  @media (prefers-color-scheme: dark) {
    body { color: #ececf2; background: #16161c; }
    th { background: #24242e; }
    th, td { border-color: #33333f; }
    code { background: #24242e; }
    a { color: #9b5de5; }
  }
</style>
</head>
<body>
${marked.parse(body)}
</body>
</html>
`;

/** Write one page at `site/dist/<path>/index.html`, or at the root for "". */
async function emit(path, html) {
  const dir = path ? join(root, "site/dist", path) : join(root, "site/dist");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html);
}

const privacy = page(
  "Privacy Policy — Kahiniscope Production",
  await textOf("privacy-policy.md")
);

// Play's crawler follows the exact URL given on the listing. Serving the
// policy at /privacy as well as at the root means the listing link can be
// the tidier of the two and still resolve if the other is ever used.
await emit("", privacy);
await emit("privacy", privacy);

// The account-deletion page is its own URL because Play asks for one
// separately from the policy, and wants the steps to be what the page is
// about rather than a line inside something longer.
await emit(
  "delete-account",
  page("Delete your account — Kahiniscope Production", await textOf("delete-account.md"))
);

console.log(`Built site/dist/ with contact ${SUPPORT_EMAIL}`);
