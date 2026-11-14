// Repo-only: NOT part of the registry item and never installed.
//
// Inside the block, files import each other as `@/components/feedbax/*` and `@/lib/feedbax/*`, because
// `shadcn add` rewrites those to whatever aliases the host's components.json uses (relative imports would
// break across the components and lib folders). In this repo `@/*` points at the portal's `src/`, so these
// declarations tell the compiler where those modules really live. `tests/block/registry.test.ts` checks that
// every installed file has a matching declaration.
declare module "@/components/feedbax/parts" {
  export * from "@/../registry/feedbax-feedback/components/parts";
}
declare module "@/components/feedbax/annotation-editor" {
  export * from "@/../registry/feedbax-feedback/components/annotation-editor";
}
declare module "@/components/feedbax/attachments" {
  export * from "@/../registry/feedbax-feedback/components/attachments";
}
declare module "@/components/feedbax/feedback-dialog" {
  export * from "@/../registry/feedbax-feedback/components/feedback-dialog";
}
declare module "@/components/feedbax/feedbax-link" {
  export * from "@/../registry/feedbax-feedback/components/feedbax-link";
}
declare module "@/lib/feedbax/annotation" {
  export * from "@/../registry/feedbax-feedback/lib/annotation";
}
declare module "@/lib/feedbax/capture" {
  export * from "@/../registry/feedbax-feedback/lib/capture";
}
declare module "@/lib/feedbax/client" {
  export * from "@/../registry/feedbax-feedback/lib/client";
}
declare module "@/lib/feedbax/draft" {
  export * from "@/../registry/feedbax-feedback/lib/draft";
}
declare module "@/lib/feedbax/images" {
  export * from "@/../registry/feedbax-feedback/lib/images";
}
declare module "@/lib/feedbax/token.server" {
  export * from "@/../registry/feedbax-feedback/lib/token.server";
}
declare module "@/lib/feedbax/types" {
  export * from "@/../registry/feedbax-feedback/lib/types";
}
