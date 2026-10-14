import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Attachment,
  AttachmentAction,
} from "@feedbax/ui/components/attachment";
import { InputGroupButton } from "@feedbax/ui/components/input-group";

describe("shared secondary form actions", () => {
  it.each([
    ["attachment action", <AttachmentAction />],
    ["input group button", <InputGroupButton />],
  ])("defaults the %s to a non-submitting button", (_name, component) => {
    expect(renderToStaticMarkup(component)).toContain('type="button"');
  });

  it("preserves horizontal as the observable default attachment orientation", () => {
    expect(renderToStaticMarkup(<Attachment />)).toContain(
      'data-orientation="horizontal"',
    );
  });
});
