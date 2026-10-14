---
status: accepted
---

# Generate flat Installations from the Core workspace

`create-feedbax` assembles the tested Core portal, deep modules, configuration, and UI source into one flat TanStack Start application. The contributor repository may retain packages and Turborepo, but generated Installations contain no workspace or Turbo files and depend only on the exact-version `feedbax` lifecycle CLI.
