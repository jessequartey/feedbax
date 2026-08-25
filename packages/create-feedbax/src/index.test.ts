import { describe, expect, it, vi } from "vitest";

import {
  assertEnabledCommentCapabilities,
  collectFeatureSelection,
  verifySelectedCommentCapabilities,
  featureChoices,
  renderFeatureConfiguration,
} from "./index";

describe("Comment capability verification", () => {
  it("runs both capability checks in the setup flow", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(
      verifySelectedCommentCapabilities(
        { voting: true, comments: true, changelog: true },
        { token: "notion-token", pageId: "post-page", request },
      ),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: "{}",
    });
  });

  it("requires both native Comment capabilities when Comments are enabled", () => {
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: true,
        capabilities: { readComments: true, insertComments: false },
      }),
    ).toThrow(
      "Enable Insert comments in the Notion connection settings, then retry setup.",
    );
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: true,
        capabilities: { readComments: false, insertComments: true },
        command: "doctor",
      }),
    ).toThrow(
      "Enable Read comments in the Notion connection settings, then rerun doctor. No changes were made.",
    );
  });

  it("does not require Comment capabilities after an explicit opt-out", () => {
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: false,
        capabilities: { readComments: false, insertComments: false },
      }),
    ).not.toThrow();
  });
});

describe("creator capability choices", () => {
  it("presents every capability as enabled by default", async () => {
    const prompts: { message: string; initialValue: boolean }[] = [];
    const confirm = async (input: {
      message: string;
      initialValue: boolean;
    }) => {
      prompts.push(input);
      return true;
    };

    await expect(collectFeatureSelection({ confirm })).resolves.toEqual({
      voting: true,
      comments: true,
      changelog: true,
    });
    expect(featureChoices.map(({ key }) => key)).toEqual([
      "voting",
      "comments",
      "changelog",
    ]);
    expect(prompts.map(({ initialValue }) => initialValue)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("emits explicit opt-outs in typed configuration", async () => {
    const answers = [true, false, true];
    const features = await collectFeatureSelection({
      confirm: async () => answers.shift() ?? true,
    });

    expect(renderFeatureConfiguration(features)).toBe(`features: {
    voting: true,
    comments: false,
    changelog: true,
  },`);
  });
});
