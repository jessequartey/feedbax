# Bound shadcn preset customization

Feedbax applies a full, version-pinned shadcn preset only while generating a new installation, before its component source is customized. Existing installations may change supported theme and font tokens, but must not reapply a full preset because shadcn deliberately overwrites installed components and may disturb monorepo configuration; Feedbax records the CLI version and preset code so generation remains reproducible.
