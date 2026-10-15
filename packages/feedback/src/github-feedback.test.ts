import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createGitHubFeedbackModule } from "./index";
import { createConnectedStore } from "./connected";
import { createConnectedFeedbackModule } from "./connected-feedback";
import { createImageModule } from "./images";
import { createImageFeedbackModule } from "./image-feedback";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});

async function setup() {
  runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
  });
  const database = await runtime.getD1Database("DB");
  await database.exec(
    await readFile(
      existsSync("apps/portal/migrations/0005_github.sql")
        ? "apps/portal/migrations/0005_github.sql"
        : "migrations/0005_github.sql",
      "utf8",
    ),
  );
  const issues: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  const writes: { method: string; body: string }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.github.com");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer scoped-token",
    );
    expect(new Headers(init?.headers).get("User-Agent")).toBe("Feedbax");
    expect(new Headers(init?.headers).get("X-GitHub-Api-Version")).toBe(
      "2026-03-10",
    );
    expect(init?.redirect).toBe("manual");
    if (url.pathname === "/repos/team/feedback")
      return Response.json({ id: 100, private: true });
    const thread = url.pathname.match(/\/issues\/(\d+)\/comments$/);
    if (thread) {
      if (init?.method !== "POST")
        return Response.json(
          comments.filter(
            (comment) => comment.issueNumber === Number(thread[1]),
          ),
        );
      writes.push({ method: "POST", body: String(init.body) });
      const comment = {
        ...JSON.parse(String(init.body)),
        id: 10000 + comments.length,
        issueNumber: Number(thread[1]),
        user: { id: 42, type: "Bot" },
        created_at: "2026-10-15T13:00:00Z",
      };
      comments.push(comment);
      return Response.json(comment, { status: 201 });
    }
    if (url.pathname.includes("/issues/comments/")) {
      const comment = comments.find(
        (value) => String(value.id) === url.pathname.split("/").at(-1),
      );
      if (!comment || comment.deleted)
        return new Response(null, { status: 404 });
      if (init?.method === "PATCH")
        Object.assign(comment, JSON.parse(String(init.body)));
      if (init?.method === "DELETE") {
        comment.deleted = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(comment);
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push({ method: "POST", body: String(init.body) });
      const issue = {
        ...body,
        id: 1000 + issues.length,
        number: issues.length + 1,
        user: { id: 42, type: "Bot" },
        created_at: "2026-10-15T12:00:00Z",
        updated_at: "2026-10-15T12:00:00Z",
      };
      issues.push(issue);
      return Response.json(issue, { status: 201 });
    }
    if (url.pathname === "/repos/team/feedback/issues")
      return Response.json(issues);
    const issue = issues.find(
      (value) => String(value.number) === url.pathname.split("/").at(-1),
    );
    if (!issue) return new Response(null, { status: 404 });
    if (init?.method === "PATCH") {
      writes.push({ method: "PATCH", body: String(init.body) });
      Object.assign(issue, JSON.parse(String(init.body)));
    }
    return Response.json(issue);
  };
  const options = {
    database,
    installationId: "portal-a",
    repository: { owner: "team", name: "feedback", id: 100 },
    botUserId: 42,
    getToken: async () => "scoped-token",
    request,
  };
  return {
    database,
    issues,
    comments,
    writes,
    options,
    feedback: createGitHubFeedbackModule(options),
  };
}

const submission = {
  title: "Export reports",
  description: "Export a report to CSV.",
  type: "Feature Request" as const,
  submitter: { name: "Alice private", email: "private@example.com" },
};

it("creates a moderated issue while keeping contacts and draft authority private across module restarts", async () => {
  const { feedback, options, writes } = await setup();
  const post = await feedback.submitPost(submission);
  expect(post).toMatchObject({
    slug: "export-reports",
    status: "New",
    published: false,
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]!.body).not.toMatch(
    /Alice private|private@example|browserCapability|externalId|submitter/,
  );
  expect(writes[0]!.body).not.toContain(post.browserCapability);
  expect(await feedback.getPublicPost(post.slug)).toBeUndefined();
  expect(
    await createGitHubFeedbackModule(options).getDraftPost({
      id: post.id,
      browserCapability: post.browserCapability,
    }),
  ).toMatchObject({ title: submission.title, submitter: submission.submitter });
});

it("recovers the original issue after an ambiguous create without exposing or duplicating the idempotency key", async () => {
  const { options, issues, writes } = await setup();
  let lost = false;
  const interrupted = createGitHubFeedbackModule({
    ...options,
    request: async (input, init) => {
      const response = await options.request(input, init);
      if (init?.method === "POST" && !lost) {
        lost = true;
        throw new Error("Response lost after GitHub commit");
      }
      return response;
    },
  });
  const command = { ...submission, externalId: "private-idempotency-key" };
  await expect(interrupted.submitTrustedPost(command)).rejects.toThrow(
    "Response lost",
  );
  const resumed =
    await createGitHubFeedbackModule(options).submitTrustedPost(command);
  expect(resumed).toMatchObject({
    slug: "export-reports",
    title: "Export reports",
  });
  expect(issues).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(writes[0]!.body).not.toContain(command.externalId);
});

it("publishes only explicit approved content and revokes it independently of issue closure and status", async () => {
  const { feedback, issues } = await setup();
  const post = await feedback.submitPost(submission);
  const issue = issues[0]!;
  issue.title = "Private engineering title";
  issue.body = `Internal discussion and private@example.com\n<!-- feedbax:public:v1 -->\n${JSON.stringify(
    {
      slug: post.slug,
      title: "Approved title",
      description: "Public description",
      type: "Bug Report",
      teamResponse: "We are investigating.",
      releaseNotesUrl: "https://example.com/releases",
      internalNote: "Do not publish this",
    },
  )}\n<!-- /feedbax:public -->\nPrivate engineering notes`;
  issue.labels = [{ name: "feedbax:planned" }, { name: "feedbax:published" }];
  issue.state = "closed";
  const visible = await feedback.getPublicPost(post.slug);
  expect(visible).toMatchObject({
    slug: post.slug,
    title: "Approved title",
    description: "Public description",
    type: "Bug Report",
    status: "Planned",
    teamResponse: "We are investigating.",
    releaseNotesUrl: "https://example.com/releases",
  });
  expect(JSON.stringify(visible)).not.toMatch(
    /Private|private@example|internalNote|issue_id|submitter/,
  );
  issue.labels = ["feedbax:planned"];
  expect(await feedback.getPublicPost(post.slug)).toBeUndefined();
});

it("edits and withdraws only eligible drafts, preserving private engineering notes and the immutable slug", async () => {
  const { feedback, options, issues } = await setup();
  const post = await feedback.submitPost(submission);
  const authority = { id: post.id, browserCapability: post.browserCapability };
  issues[0]!.body = `Private prefix\n${issues[0]!.body}\nPrivate suffix`;
  const edited = await feedback.editDraftPost({
    ...authority,
    title: "A renamed request",
  });
  expect(edited).toMatchObject({
    title: "A renamed request",
    slug: "export-reports",
  });
  expect(issues[0]!.body).toMatch(/^Private prefix\n/);
  expect(issues[0]!.body).toMatch(/\nPrivate suffix$/);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  await expect(
    feedback.editDraftPost({ ...authority, title: "Forbidden" }),
  ).rejects.toThrow("did not authorize");
  issues[0]!.labels = ["feedbax:reviewing"];
  await expect(feedback.withdrawDraftPost(authority)).rejects.toThrow(
    "did not authorize",
  );
  issues[0]!.labels = ["feedbax:new"];
  await feedback.withdrawDraftPost(authority);
  expect(issues[0]!.state).toBe("closed");
  expect(
    await createGitHubFeedbackModule(options).getPublicPost(post.slug),
  ).toBeUndefined();
  await expect(feedback.getDraftPost(authority)).rejects.toThrow(
    "did not authorize",
  );
});

it("filters and paginates public Posts and roadmap totals without admitting unmapped issues or PRs", async () => {
  const { feedback, issues } = await setup();
  await Promise.all(
    Array.from({ length: 27 }, (_, index) =>
      feedback.submitPost({ ...submission, title: `Request ${index}` }),
    ),
  );
  for (const issue of issues)
    issue.labels = ["feedbax:planned", "feedbax:published"];
  issues.push({ ...issues[0], id: 9999, number: 9999 });
  issues.push({ ...issues[0], pull_request: { url: "private-pr-url" } });
  const first = await feedback.listPublicPosts({ sort: "new" });
  expect(first.items).toHaveLength(25);
  expect(first.nextCursor).toBeTruthy();
  const second = await feedback.listPublicPosts({
    sort: "new",
    cursor: first.nextCursor,
  });
  expect(second.items).toHaveLength(2);
  expect(
    new Set([...first.items, ...second.items].map((post) => post.slug)).size,
  ).toBe(27);
  expect(
    (await feedback.listPublicPosts({ search: "Request 26" })).items.map(
      (post) => post.slug,
    ),
  ).toEqual(["request-26"]);
  expect(
    (await feedback.listPublicRoadmapPosts({ status: "Planned" })).totalCount,
  ).toBe(27);
  await expect(
    feedback.listPublicPosts({ search: "changed", cursor: first.nextCursor }),
  ).rejects.toThrow("cursor");
  issues[0]!.labels = ["feedbax:planned"];
  expect(
    (await feedback.listPublicRoadmapPosts({ status: "Planned" })).totalCount,
  ).toBe(26);
});

it("persists best-effort support privately and ranks by it without using GitHub reactions", async () => {
  const { feedback, options, issues, writes } = await setup();
  const first = await feedback.submitPost(submission);
  await feedback.submitPost({ ...submission, title: "Another request" });
  for (const issue of issues)
    issue.labels = ["feedbax:planned", "feedbax:published"];
  expect(
    await feedback.changeVote({ slug: first.slug, intention: "add" }),
  ).toEqual({ slug: first.slug, voteCount: 1 });
  const restarted = createGitHubFeedbackModule(options);
  expect((await restarted.listPublicPosts()).items[0]).toMatchObject({
    slug: first.slug,
    voteCount: 1,
  });
  expect(writes).toHaveLength(2);
  expect(
    await restarted.changeVote({ slug: first.slug, intention: "remove" }),
  ).toEqual({ slug: first.slug, voteCount: 0 });
});

it("honors a bounded Retry-After on GitHub reads without exposing the provider response", async () => {
  const { feedback, options, issues } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const delays: number[] = [];
  let limited = false;
  const retried = createGitHubFeedbackModule({
    ...options,
    sleep: async (delay) => {
      delays.push(delay);
    },
    request: async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/issues/1") && !limited) {
        limited = true;
        return new Response("Private rate-limit diagnostic", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return options.request(input, init);
    },
  });
  expect(await retried.getPublicPost(post.slug)).toMatchObject({
    title: submission.title,
  });
  expect(delays).toEqual([1000]);
});

it("keeps marker-looking Participant text as content without turning it into another public section", async () => {
  const { feedback, issues } = await setup();
  const description =
    "Please support <!-- feedbax:public:v1 --> and <!-- /feedbax:public --> in examples.";
  const post = await feedback.submitPost({ ...submission, description });
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  expect(await feedback.getPublicPost(post.slug)).toMatchObject({
    description,
  });
});

it("never reuses the slug of a withdrawn Post", async () => {
  const { feedback } = await setup();
  const original = await feedback.submitPost(submission);
  await feedback.withdrawDraftPost({
    id: original.id,
    browserCapability: original.browserCapability,
  });
  const next = await feedback.submitPost(submission);
  expect(next.slug).toBe("export-reports-2");
  expect(await feedback.getPublicPost(original.slug)).toBeUndefined();
});

it("persists portal Comment threads and edits without publishing engineering comments or forged markers", async () => {
  const { feedback, options, issues, comments } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const first = await feedback.createComment({
    slug: post.slug,
    displayName: "Alice",
    body: "Please add CSV.",
  });
  await feedback.replyToCommentThread({
    slug: post.slug,
    discussionId: first.discussionId,
    displayName: "Bob",
    body: "I agree.",
  });
  comments.push({
    id: 99990,
    issueNumber: 1,
    body: "Private engineering conversation",
    user: { id: 22 },
    created_at: "2026-10-15T13:00:00Z",
  });
  comments.push({ ...comments[0], id: 99991, user: { id: 22 } });
  comments.push({ ...comments[0], id: 99992 });
  const restarted = createGitHubFeedbackModule(options);
  const page = await restarted.listCommentThreads({ slug: post.slug });
  expect(page.items).toHaveLength(1);
  expect(
    page.items[0]!.comments.map((comment) => [
      comment.body,
      comment.author.displayName,
    ]),
  ).toEqual([
    ["Please add CSV.", "Alice"],
    ["I agree.", "Bob"],
  ]);
  await restarted.editComment({
    commentId: first.id,
    body: "CSV and JSON, please.",
  });
  expect(
    (await feedback.listCommentThreads({ slug: post.slug })).items[0]!
      .comments[0]!.body,
  ).toBe("CSV and JSON, please.");
  await restarted.deleteComment({ commentId: first.id });
  expect(
    (await feedback.listCommentThreads({ slug: post.slug })).items
      .flatMap((thread) => thread.comments)
      .map((comment) => comment.body),
  ).toEqual(["I agree."]);
});

it("recovers a provider success followed by a real D1 mapping failure", async () => {
  const { database, feedback, options, issues, writes } = await setup();
  await database.exec(
    "CREATE TRIGGER fail_mapping BEFORE UPDATE ON github_posts WHEN NEW.state='ready' BEGIN SELECT RAISE(ABORT,'injected mapping failure'); END;",
  );
  const input = { ...submission, externalId: "mapping-failure" };
  await expect(feedback.submitTrustedPost(input)).rejects.toThrow(
    "injected mapping failure",
  );
  await database.exec("DROP TRIGGER fail_mapping;");
  const recovered =
    await createGitHubFeedbackModule(options).submitTrustedPost(input);
  expect(recovered.slug).toBe("export-reports");
  expect(issues).toHaveLength(1);
  expect(writes).toHaveLength(1);
});

it("isolates private mappings and public results by authenticated Installation", async () => {
  const { feedback, options, issues } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const other = createGitHubFeedbackModule({
    ...options,
    installationId: "portal-b",
  });
  expect(await other.getPublicPost(post.slug)).toBeUndefined();
  expect((await other.listPublicPosts()).items).toEqual([]);
  await expect(
    other.getDraftPost({
      id: post.id,
      browserCapability: post.browserCapability,
    }),
  ).rejects.toThrow("did not authorize");
});

it("retains the last valid status on label conflicts while publication revocation wins", async () => {
  const { feedback, issues } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:planned", "feedbax:published"];
  expect((await feedback.getPublicPost(post.slug))?.status).toBe("Planned");
  issues[0]!.labels = [
    "feedbax:closed",
    "feedbax:shipped",
    "feedbax:published",
  ];
  expect((await feedback.getPublicPost(post.slug))?.status).toBe("Planned");
  issues[0]!.labels = ["feedbax:closed", "feedbax:shipped"];
  expect(await feedback.getPublicPost(post.slug)).toBeUndefined();
});

it.each(["missing", "duplicate", "slug-change", "unsafe-link"])(
  "fails closed for malformed public content: %s",
  async (variant) => {
    const { feedback, issues } = await setup();
    const post = await feedback.submitPost(submission);
    issues[0]!.labels = ["feedbax:new", "feedbax:published"];
    const original = String(issues[0]!.body);
    if (variant === "missing") issues[0]!.body = "Private notes only";
    if (variant === "duplicate") issues[0]!.body = original + original;
    if (variant === "slug-change")
      issues[0]!.body = original.replace("export-reports", "different-slug");
    if (variant === "unsafe-link") {
      issues[0]!.body = original.replace(
        '"type":',
        '"releaseNotesUrl":"javascript:private()","type":',
      );
      expect(await feedback.getPublicPost(post.slug)).not.toHaveProperty(
        "releaseNotesUrl",
      );
    } else expect(await feedback.getPublicPost(post.slug)).toBeUndefined();
  },
);

it("preserves Connected unique Votes and verified Comment attribution on the GitHub adapter", async () => {
  const { database, feedback, options, issues } = await setup();
  for (const name of ["0001_connected.sql", "0002_participation.sql"])
    await database.exec(
      await readFile(
        existsSync(`apps/portal/migrations/${name}`)
          ? `apps/portal/migrations/${name}`
          : `migrations/${name}`,
        "utf8",
      ),
    );
  const person = { subject: "private-subject", displayName: "Alice" };
  const store = createConnectedStore(database);
  await store.acceptIdentity({
    ...person,
    nonce: "nonce",
    sessionHash: "hash",
    expiresAt: Date.now() + 60000,
  });
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const one = createConnectedFeedbackModule(feedback, store, person);
  const two = createConnectedFeedbackModule(
    createGitHubFeedbackModule(options),
    store,
    person,
  );
  await Promise.all([
    one.changeVote({ slug: post.slug, intention: "add" }),
    two.changeVote({ slug: post.slug, intention: "add" }),
  ]);
  expect(await two.getPublicPost(post.slug)).toMatchObject({ voteCount: 1 });
  await one.createComment({
    slug: post.slug,
    body: "Signed feedback",
    displayName: "Forged name",
  });
  const thread = await two.listCommentThreads({ slug: post.slug });
  expect(thread.items[0]!.comments[0]!.author).toEqual({
    kind: "participant",
    displayName: "Alice",
    verified: true,
  });
  expect(JSON.stringify(thread)).not.toContain(person.subject);
});

it("retries a definitively rate-limited creation later using the same reserved operation", async () => {
  const { feedback, options, issues } = await setup();
  let attempts = 0;
  const limited = createGitHubFeedbackModule({
    ...options,
    sleep: async () => {},
    request: async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        return new Response("private diagnostics", {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      return options.request(input, init);
    },
  });
  const command = { ...submission, externalId: "rate-limited-command" };
  await expect(limited.submitTrustedPost(command)).rejects.toThrow("429");
  expect(attempts).toBe(3);
  expect((await feedback.submitTrustedPost(command)).slug).toBe(
    "export-reports",
  );
  expect(issues).toHaveLength(1);
});

it("uses approved content changes for public update times without exposing later engineering activity", async () => {
  const { feedback, issues } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:planned", "feedbax:published"];
  await feedback.getPublicPost(post.slug);
  issues[0]!.body = String(issues[0]!.body).replace(
    "Export a report to CSV.",
    "CSV export has been approved.",
  );
  issues[0]!.updated_at = "2026-10-15T13:10:00Z";
  expect((await feedback.getPublicPost(post.slug))?.updatedAt).toEqual(
    new Date("2026-10-15T13:10:00Z"),
  );
  issues[0]!.body = `Private new engineering notes\n${issues[0]!.body}`;
  issues[0]!.updated_at = "2026-10-15T14:20:00Z";
  expect(
    (await feedback.listPublicRoadmapPosts({ status: "Planned" })).totalCount,
  ).toBe(1);
  expect((await feedback.getPublicPost(post.slug))?.updatedAt).toEqual(
    new Date("2026-10-15T13:10:00Z"),
  );
});

it("preserves Team Response during Participant draft edits and honors its later removal", async () => {
  const { feedback, issues } = await setup();
  const post = await feedback.submitPost(submission);
  const original = String(issues[0]!.body);
  issues[0]!.body = original.replace(
    '"type":',
    '"teamResponse":"Approved response","type":',
  );
  await feedback.editDraftPost({
    id: post.id,
    browserCapability: post.browserCapability,
    title: "New draft title",
  });
  expect(String(issues[0]!.body)).toContain("Approved response");
  issues[0]!.body = original;
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  expect(await feedback.getPublicPost(post.slug)).not.toHaveProperty(
    "teamResponse",
  );
});

it("does not duplicate concurrent trusted submissions with the same operation key", async () => {
  const { options, feedback, issues, writes } = await setup();
  const command = { ...submission, externalId: "concurrent-key" };
  const attempts = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      createGitHubFeedbackModule(options).submitTrustedPost(command),
    ),
  );
  expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(true);
  const resumed = await feedback.submitTrustedPost(command);
  expect(issues).toHaveLength(1);
  expect(writes).toHaveLength(1);
  for (const attempt of attempts)
    if (attempt.status === "fulfilled")
      expect(attempt.value.id).toBe(resumed.id);
});

it("does not blindly repeat a create whose upstream failure has an uncertain outcome", async () => {
  const { options, feedback, writes } = await setup();
  let creates = 0;
  const unavailable = createGitHubFeedbackModule({
    ...options,
    request: async (input, init) => {
      if (init?.method === "POST") {
        creates++;
        return new Response("Private diagnostic", { status: 503 });
      }
      return options.request(input, init);
    },
  });
  const command = { ...submission, externalId: "uncertain-key" };
  await expect(unavailable.submitTrustedPost(command)).rejects.toThrow("503");
  await expect(feedback.submitTrustedPost(command)).rejects.toThrow(
    "pending reconciliation",
  );
  expect(creates).toBe(1);
  expect(writes).toHaveLength(0);
});

it("rejects a repository whose current identity no longer matches the authenticated binding", async () => {
  const { options, writes } = await setup();
  const moved = createGitHubFeedbackModule({
    ...options,
    request: async (input, init) => {
      if (new URL(String(input)).pathname === "/repos/team/feedback")
        return Response.json({ id: 200, private: false });
      return options.request(input, init);
    },
  });
  await expect(
    moved.submitTrustedPost({ ...submission, externalId: "wrong-repo" }),
  ).rejects.toThrow("Portal Binding");
  expect(writes).toHaveLength(0);
});

it("keeps real R2 attachments private until the GitHub Post is published and revokes access on unpublication", async () => {
  const { database, feedback, issues } = await setup();
  for (const name of [
    "0001_connected.sql",
    "0002_participation.sql",
    "0003_images.sql",
  ])
    await database.exec(
      await readFile(
        existsSync(`apps/portal/migrations/${name}`)
          ? `apps/portal/migrations/${name}`
          : `migrations/${name}`,
        "utf8",
      ),
    );
  const participant = { subject: "alice", displayName: "Alice" };
  await createConnectedStore(database).acceptIdentity({
    ...participant,
    nonce: "image",
    sessionHash: "image",
    expiresAt: Date.now() + 60000,
  });
  const bucket = await runtime!.getR2Bucket("IMAGES");
  const options = { database, bucket, feedback, reviewSecret: "s".repeat(32) };
  const owner = createImageModule({ ...options, participant });
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const uploaded = await owner.upload(png, "image/png");
  await createImageFeedbackModule(feedback, owner).submitPost({
    ...submission,
    imageIds: [uploaded.id],
  });
  const anonymous = createImageModule(options);
  expect(await anonymous.read(uploaded.id)).toBeUndefined();
  expect(String(issues[0]!.body)).not.toContain(uploaded.id);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  expect(await anonymous.read(uploaded.id)).toBeDefined();
  issues[0]!.labels = ["feedbax:new"];
  expect(await anonymous.read(uploaded.id)).toBeUndefined();
});

it("does not treat a retained New status as draft editing authority while workflow labels conflict", async () => {
  const { feedback, issues } = await setup();
  const post = await feedback.submitPost(submission);
  const authority = { id: post.id, browserCapability: post.browserCapability };
  issues[0]!.labels = ["feedbax:new", "feedbax:planned"];
  await expect(feedback.getDraftPost(authority)).rejects.toThrow(
    "did not authorize",
  );
  await expect(
    feedback.editDraftPost({ ...authority, title: "Forbidden" }),
  ).rejects.toThrow("did not authorize");
  await expect(feedback.withdrawDraftPost(authority)).rejects.toThrow(
    "did not authorize",
  );
});

it("recovers a browser submission and its draft authority after a lost create response without storing or publishing the secret intent", async () => {
  const { options, issues, writes } = await setup();
  let lost = false;
  const first = createGitHubFeedbackModule({
    ...options,
    request: async (input, init) => {
      const response = await options.request(input, init);
      if (init?.method === "POST" && !lost) {
        lost = true;
        throw new Error("Browser response lost");
      }
      return response;
    },
  });
  const command = { ...submission, submissionKey: "k".repeat(43) };
  await expect(first.submitPost(command)).rejects.toThrow("response lost");
  const restarted = createGitHubFeedbackModule(options);
  const recovered = await restarted.submitPost(command);
  expect(issues).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(writes[0]!.body).not.toContain(command.submissionKey);
  expect(recovered.slug).toBe("export-reports");
  expect(
    await restarted.getDraftPost({
      id: recovered.id,
      browserCapability: recovered.browserCapability,
    }),
  ).toMatchObject({ title: submission.title });
  expect(
    (await restarted.submitPost({ ...command, title: "Changed retry" })).id,
  ).toBe(recovered.id);
});

it("keeps verified ownership private across devices and permits only eligible owner draft changes", async () => {
  const { createPostOwnership, createMyFeedbackModule } =
    await import("./ownership");
  const { options, issues } = await setup();
  await options.database.exec(
    await readFile(
      existsSync("apps/portal/migrations/0007_ownership.sql")
        ? "apps/portal/migrations/0007_ownership.sql"
        : "migrations/0007_ownership.sql",
      "utf8",
    ),
  );
  const alice = { subject: "application:alice", displayName: "Alice" };
  const bob = { subject: "application:bob", displayName: "Bob" };
  const first = createGitHubFeedbackModule({
    ...options,
    ownership: createPostOwnership(options.database, alice),
  });
  const post = await first.submitPost({
    ...submission,
    submissionKey: "o".repeat(43),
  });
  const otherDevice = createGitHubFeedbackModule({
    ...options,
    ownership: createPostOwnership(options.database, alice),
  });
  expect(await otherDevice.getDraftPost({ id: post.id })).toMatchObject({
    title: submission.title,
  });
  await otherDevice.editDraftPost({
    id: post.id,
    title: "Owner edit from another device",
  });
  const ownerView = createMyFeedbackModule({
    database: options.database,
    feedback: otherDevice,
    participant: alice,
  });
  expect(
    (await ownerView.list({ filter: "submitted" })).items[0],
  ).toMatchObject({ title: "Owner edit from another device", editable: true });
  const otherParticipant = createGitHubFeedbackModule({
    ...options,
    ownership: createPostOwnership(options.database, bob),
  });
  await expect(otherParticipant.getDraftPost({ id: post.id })).rejects.toThrow(
    "authorize",
  );
  expect(await otherParticipant.getParticipantPost(post.id)).toBeUndefined();
  expect(
    (
      await createMyFeedbackModule({
        database: options.database,
        feedback: otherParticipant,
        participant: bob,
      }).list({ filter: "submitted" })
    ).items,
  ).toEqual([]);
  issues[0]!.labels = ["feedbax:published", "feedbax:planned"];
  await expect(
    otherDevice.editDraftPost({ id: post.id, title: "Forbidden" }),
  ).rejects.toThrow("authorize");
  expect(
    (await ownerView.list({ filter: "submitted" })).items[0],
  ).toMatchObject({ status: "Planned", editable: false });
  expect(JSON.stringify(issues)).not.toContain(alice.subject);
});

it("links an unsigned old draft only with both verified identity and its browser capability, without transferring an existing owner", async () => {
  const { createPostOwnership, createMyFeedbackModule } =
    await import("./ownership");
  const { options, feedback } = await setup();
  await options.database.exec(
    await readFile(
      existsSync("apps/portal/migrations/0007_ownership.sql")
        ? "apps/portal/migrations/0007_ownership.sql"
        : "migrations/0007_ownership.sql",
      "utf8",
    ),
  );
  const draft = await feedback.submitPost(submission);
  const alice = { subject: "issuer:alice", displayName: "Alice" };
  const bob = { subject: "issuer:bob", displayName: "Bob" };
  const owned = createGitHubFeedbackModule({
    ...options,
    ownership: createPostOwnership(options.database, alice),
  });
  await expect(
    owned.claimDraftPost({
      id: draft.id,
      browserCapability: "forged" as import("./index").BrowserCapability,
    }),
  ).rejects.toThrow("authorize");
  await expect(
    feedback.claimDraftPost({
      id: draft.id,
      browserCapability: draft.browserCapability,
    }),
  ).rejects.toThrow("authorize");
  expect(
    await owned.claimDraftPost({
      id: draft.id,
      browserCapability: draft.browserCapability,
    }),
  ).toMatchObject({ id: draft.id, editable: true });
  const attacker = createGitHubFeedbackModule({
    ...options,
    ownership: createPostOwnership(options.database, bob),
  });
  await expect(
    attacker.claimDraftPost({
      id: draft.id,
      browserCapability: draft.browserCapability,
    }),
  ).rejects.toThrow("authorize");
  expect(await attacker.getParticipantPost(draft.id)).toBeUndefined();
  expect(
    (
      await createMyFeedbackModule({
        database: options.database,
        feedback: owned,
        participant: alice,
      }).list({ filter: "submitted" })
    ).items,
  ).toHaveLength(1);
});

it("recovers a retried Comment intent after GitHub succeeds but its reply is lost", async () => {
  const { options, feedback, issues, comments, writes } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  let lost = false;
  const interrupted = createGitHubFeedbackModule({
    ...options,
    request: async (input, init) => {
      const response = await options.request(input, init);
      if (
        init?.method === "POST" &&
        String(input).endsWith("/comments") &&
        !lost
      ) {
        lost = true;
        throw Error("Comment reply lost");
      }
      return response;
    },
  });
  const intent = {
    slug: post.slug,
    body: "A useful public comment",
    displayName: "Alice",
    submissionKey: "c".repeat(43),
  };
  await expect(interrupted.createComment(intent)).rejects.toThrow("reply lost");
  const restarted = createGitHubFeedbackModule(options);
  const recovered = await restarted.createComment(intent);
  expect(comments).toHaveLength(1);
  expect((await restarted.createComment(intent)).id).toBe(recovered.id);
  expect(comments).toHaveLength(1);
  expect(JSON.stringify(writes)).not.toContain(intent.submissionKey);
  await restarted.createComment({ ...intent, submissionKey: "d".repeat(43) });
  expect(comments).toHaveLength(2);
});

it("recovers Connected Comment attribution without deleting or duplicating an already attributed Comment", async () => {
  const { options, feedback, issues, comments } = await setup();
  for (const name of ["0001_connected.sql", "0002_participation.sql"])
    await options.database.exec(
      await readFile(
        existsSync(`apps/portal/migrations/${name}`)
          ? `apps/portal/migrations/${name}`
          : `migrations/${name}`,
        "utf8",
      ),
    );
  const alice = { subject: "issuer:alice", displayName: "Alice" };
  const store = createConnectedStore(options.database);
  await store.acceptIdentity({
    ...alice,
    nonce: "comment-intent",
    sessionHash: "comment-intent",
    expiresAt: Date.now() + 60000,
  });
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const connected = createConnectedFeedbackModule(
    createGitHubFeedbackModule(options),
    store,
    alice,
  );
  const intent = {
    slug: post.slug,
    body: "Verified comment",
    displayName: "Ignored",
    submissionKey: "e".repeat(43),
  };
  const first = await connected.createComment(intent);
  const retried = await connected.createComment(intent);
  expect(retried.id).toBe(first.id);
  expect(retried.author).toMatchObject({
    displayName: "Alice",
    verified: true,
  });
  expect(comments).toHaveLength(1);
  expect(comments[0]!.deleted).not.toBe(true);
  expect(
    (await connected.listCommentThreads({ slug: post.slug })).items[0]
      ?.comments[0]?.id,
  ).toBe(first.id);
});

it("resumes the same Comment intent after definitive rate limiting clears", async () => {
  const { options, feedback, issues, comments } = await setup();
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  let limited = true;
  const module = createGitHubFeedbackModule({
    ...options,
    sleep: async () => {},
    request: async (input, init) => {
      if (
        limited &&
        init?.method === "POST" &&
        String(input).endsWith("/comments")
      )
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      return options.request(input, init);
    },
  });
  const intent = {
    slug: post.slug,
    body: "Retry after quota",
    displayName: "Alice",
    submissionKey: "r".repeat(43),
  };
  await expect(module.createComment(intent)).rejects.toThrow("rate limited");
  limited = false;
  const recovered = await module.createComment(intent);
  expect((await module.createComment(intent)).id).toBe(recovered.id);
  expect(comments).toHaveLength(1);
});

it("recovers an attached verified Comment and a transient attribution failure without deleting the original", async () => {
  const { options, feedback, issues, comments } = await setup();
  for (const name of [
    "0001_connected.sql",
    "0002_participation.sql",
    "0003_images.sql",
  ])
    await options.database.exec(
      await readFile(
        existsSync(`apps/portal/migrations/${name}`)
          ? `apps/portal/migrations/${name}`
          : `migrations/${name}`,
        "utf8",
      ),
    );
  const alice = { subject: "issuer:alice", displayName: "Alice" };
  const store = createConnectedStore(options.database);
  await store.acceptIdentity({
    ...alice,
    nonce: "attached-recovery",
    sessionHash: "attached-recovery",
    expiresAt: Date.now() + 60000,
  });
  const post = await feedback.submitPost(submission);
  issues[0]!.labels = ["feedbax:new", "feedbax:published"];
  const connected = createConnectedFeedbackModule(
    createGitHubFeedbackModule(options),
    store,
    alice,
  );
  const images = createImageModule({
    database: options.database,
    bucket: await runtime!.getR2Bucket("IMAGES"),
    feedback: connected,
    participant: alice,
    reviewSecret: "s".repeat(40),
  });
  const module = createImageFeedbackModule(connected, images);
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const image = await images.upload(png, "image/png");
  const intent = {
    slug: post.slug,
    body: "With screenshot",
    displayName: "Ignored",
    imageIds: [image.id],
    submissionKey: "i".repeat(43),
  };
  await options.database.exec(
    "CREATE TRIGGER fail_attribution BEFORE INSERT ON comment_attribution BEGIN SELECT RAISE(FAIL,'Attribution unavailable'); END;",
  );
  await expect(module.createComment(intent)).rejects.toThrow();
  await options.database.exec("DROP TRIGGER fail_attribution;");
  const first = await module.createComment(intent);
  const retried = await module.createComment(intent);
  expect(retried.id).toBe(first.id);
  expect(retried.images?.map((image) => image.id)).toEqual([image.id]);
  expect(retried.author).toMatchObject({
    displayName: "Alice",
    verified: true,
  });
  expect(comments).toHaveLength(1);
  expect(comments[0]!.deleted).not.toBe(true);
  expect(JSON.stringify(retried)).not.toContain("recoverable");
  await expect(
    module.createComment({
      ...intent,
      body: "Edited after lost reply",
      submissionKey: "j".repeat(43),
    }),
  ).rejects.toThrow("another Comment intent");
  expect(comments).toHaveLength(1);
  expect(
    (await module.listCommentThreads({ slug: post.slug })).items.flatMap(
      (thread) => thread.comments,
    ),
  ).toHaveLength(1);
  await module.deleteComment({ commentId: retried.id });
  await expect(module.createComment(intent)).rejects.toThrow();
  expect(comments).toHaveLength(1);
});
