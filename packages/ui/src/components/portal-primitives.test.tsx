import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarFallback } from "@feedbax/ui/components/avatar";
import { Command, CommandInput, CommandItem } from "@feedbax/ui/components/command";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@feedbax/ui/components/field";
import { Kbd } from "@feedbax/ui/components/kbd";
import { RadioGroup, RadioGroupItem } from "@feedbax/ui/components/radio-group";
import { ScrollArea } from "@feedbax/ui/components/scroll-area";
import { Sheet, SheetTrigger } from "@feedbax/ui/components/sheet";
import { Spinner } from "@feedbax/ui/components/spinner";

describe("redesigned portal registry primitives", () => {
  it("renders a field with an associated label", () => {
    const markup = renderToStaticMarkup(
      <Field>
        <FieldLabel htmlFor="title">Title</FieldLabel>
      </Field>,
    );
    expect(markup).toContain("<label");
    expect(markup).toContain("Title");
  });

  it("renders a field error message", () => {
    const markup = renderToStaticMarkup(
      <FieldError errors={[{ message: "Title is required" }]} />,
    );
    expect(markup).toContain("Title is required");
  });

  it("renders a command palette shell with an input and items", () => {
    const markup = renderToStaticMarkup(
      <Command>
        <CommandInput placeholder="Search feedback…" />
        <CommandItem>Keyboard-first search</CommandItem>
      </Command>,
    );
    expect(markup).toContain("Search feedback…");
    expect(markup).toContain("Keyboard-first search");
  });

  it("renders an avatar fallback with initials", () => {
    const markup = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>MC</AvatarFallback>
      </Avatar>,
    );
    expect(markup).toContain("MC");
  });

  it("renders a sheet trigger", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <SheetTrigger>Filters</SheetTrigger>
      </Sheet>,
    );
    expect(markup).toContain("Filters");
  });

  it("renders a kbd hint", () => {
    expect(renderToStaticMarkup(<Kbd>⌘K</Kbd>)).toContain("⌘K");
  });

  it("renders a radio group with an item", () => {
    const markup = renderToStaticMarkup(
      <RadioGroup>
        <RadioGroupItem value="feature" />
      </RadioGroup>,
    );
    expect(markup).toContain("radiogroup");
  });

  it("renders a scroll area with content", () => {
    const markup = renderToStaticMarkup(<ScrollArea>Posts</ScrollArea>);
    expect(markup).toContain("Posts");
  });

  it("renders a spinner", () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain("svg");
  });
});
