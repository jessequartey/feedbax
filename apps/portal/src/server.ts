import { createPortalServerEntry } from "./portal-server-entry";
import { createConfiguredTrustedFeedbackHandler } from "./trusted-feedback-runtime";

export default createPortalServerEntry({
  trustedFeedbackHandler: async (request) => {
    try {
      return await createConfiguredTrustedFeedbackHandler()(request);
    } catch {
      return Response.json(
        { error: "Trusted submission is unavailable." },
        { status: 503 },
      );
    }
  },
});
