import {
  boundedBody,
  BrowserCapabilityAuthorizationError,
  createMyFeedbackModule,
  type ConnectedDatabase,
  type FeedbackModule,
  type VerifiedParticipant,
} from "@feedbax/feedback";
import { sameOrigin } from "./connected-identity";
import { createPortalDraftManagement } from "./portal-feedback-submission";

export function createMyFeedbackRequestHandler(options: {
  enabled: boolean;
  siteUrl: string;
  database: ConnectedDatabase;
  getParticipant(request: Request): Promise<VerifiedParticipant | undefined>;
  getFeedback(participant: VerifiedParticipant): FeedbackModule;
  rateLimit(request: Request): Promise<boolean>;
  limits?: { maxTitleLength: number; maxDescriptionLength: number };
}) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        Vary: "Cookie",
      },
    });
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/internal/my-feedback")) return;
    if (!options.enabled) return json({ error: "Not found." }, 404);
    if (request.method !== "GET" && !sameOrigin(request, options.siteUrl))
      return json({ error: "Request origin is invalid." }, 403);
    try {
      const participant = await options.getParticipant(request);
      if (!participant)
        return json(
          { error: "Sign in through the product to view My feedback." },
          401,
        );
      if (!(await options.rateLimit(request)))
        return json({ error: "Too many requests. Try again shortly." }, 429);
      const feedback = options.getFeedback(participant);
      if (
        url.pathname === "/internal/my-feedback" &&
        request.method === "GET"
      ) {
        const filter = url.searchParams.get("filter") ?? "submitted";
        if (
          filter !== "submitted" &&
          filter !== "supported" &&
          filter !== "following"
        )
          return json({ error: "Invalid My feedback filter." }, 400);
        return json(
          await createMyFeedbackModule({
            database: options.database,
            feedback,
            participant,
          }).list({
            filter,
            cursor: url.searchParams.get("cursor") ?? undefined,
          }),
        );
      }
      if (
        url.pathname !== "/internal/my-feedback/post" ||
        request.method !== "POST"
      )
        return json({ error: "Not found." }, 404);
      const value = JSON.parse(await boundedBody(request, 16_384)) as Record<
        string,
        unknown
      >;
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        value.id.length > 128
      )
        return json({ error: "Invalid submission request." }, 400);
      if (value.action === "claim") {
        if (
          typeof value.browserCapability !== "string" ||
          value.browserCapability.length > 512
        )
          return json(
            {
              error:
                "A valid Browser Capability is required to link this draft.",
            },
            400,
          );
        const draft = await feedback.claimDraftPost({
          id: value.id,
          browserCapability:
            value.browserCapability as import("@feedbax/feedback").BrowserCapability,
        });
        return draft
          ? json(draft)
          : json({ error: "Submission unavailable." }, 404);
      }
      const post = await feedback.getParticipantPost(value.id);
      if (!post) return json({ error: "Submission unavailable." }, 404);
      if (value.action === "read") return json(post);
      if (!post.editable)
        return json(
          { error: "Only New, unpublished drafts may be changed." },
          409,
        );
      const drafts = createPortalDraftManagement({
        feedback,
        limits: options.limits ?? {
          maxTitleLength: 160,
          maxDescriptionLength: 5000,
        },
      });
      if (value.action === "edit") {
        const updated = await drafts.edit({
          ...value,
          browserCapability: "participant-owner",
        });
        return json({
          id: updated.id,
          slug: updated.slug,
          title: updated.title,
          description: updated.description,
          type: updated.type,
          status: updated.status,
          published: updated.published,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        });
      }
      if (value.action === "withdraw") {
        await drafts.withdraw({
          id: value.id,
          browserCapability: "participant-owner",
        });
        return json({ withdrawn: true });
      }
      return json({ error: "Invalid submission action." }, 400);
    } catch (error) {
      if (error instanceof BrowserCapabilityAuthorizationError)
        return json({ error: "Submission unavailable." }, 404);
      return json(
        { error: "My feedback is unavailable. Refresh and try again." },
        503,
      );
    }
  };
}
