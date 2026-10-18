import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

const { confluenceStorageToText } = await import("@/lib/knowledge/confluence");

const code = (body: string) =>
  `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">xml</ac:parameter><ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>`;

describe("confluenceStorageToText", () => {
  it("turns a storage-format page into clean text", () => {
    const storage = readFileSync(new URL("./fixtures/confluence-page.html", import.meta.url), "utf8");
    expect(confluenceStorageToText(storage)).toBe(
      [
        "# Resetting a password",
        "Customers can reset their password from the sign-in page.",
        "Reset links expire after one hour.",
        "## Steps",
        "- Open the sign-in page.\n- Choose Forgot password. See Account recovery if the email never arrives.",
        "## API",
        `curl -X POST https://example.com/api/auth/request-password-reset \\\n-d '{"email":"a@b.co"}' && echo "<done>" # arr[i]]>0`,
        "## Limits",
        "Plan | Resets per hour |",
        "Free | 3 |",
        "Why did my reset link expire?",
        "Links are single use.",
        "Admins can reset passwords for any member.",
        "- Document SSO resets",
        "Questions? Contact support.",
      ].join("\n\n"),
    );
  });

  it("keeps code that contains Confluence markup as literal text", () => {
    const markup = '<ac:parameter ac:name="title">Intro</ac:parameter><ac:task-id>1</ac:task-id>';
    expect(confluenceStorageToText(code(markup))).toBe(markup);
  });

  it("returns no text for a page with only macros", () => {
    expect(
      confluenceStorageToText(
        '<ac:structured-macro ac:name="children"><ac:parameter ac:name="all">true</ac:parameter></ac:structured-macro>',
      ),
    ).toBe("");
  });
});
