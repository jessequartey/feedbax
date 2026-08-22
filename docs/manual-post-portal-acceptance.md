# Post portal manual acceptance

The UI phase remains open until a maintainer completes this path and gives the green light.

1. Open `/` at desktop and mobile widths. Confirm the feed loads with Trending selected, the system theme is respected, direct Feedback/Roadmap/Changelog navigation works, the compact introduction is present, keyboard focus is visible, and mobile navigation opens in a Drawer.
2. Exercise Trending, Top, and New; search title and description; apply several Post Type and Post Status filters together; refresh and use Back/Forward; clear all filters; load another page without losing visible Posts.
3. Create a Device Profile, create two Posts, and confirm both Draft Posts remain pinned and searchable. Clear the profile and confirm both Browser Capabilities still work and public output contains no profile fields.
4. Open a Post from the feed and roadmap, then open `/p/:slug` directly. Confirm feed navigation uses a desktop Dialog or mobile Drawer, direct navigation renders a full page, title edits leave the clean URL unchanged, unavailable Posts expose no private diagnostics, and close/Back/Forward restore the prior feed state and focus.
5. Edit a New unpublished Draft Post, cancel an edit, retry a failed mutation, then withdraw after the permanent-action confirmation. Confirm every visible representation reconciles and the capability is removed.
6. Check the three roadmap columns, empty and skeleton states, horizontal mobile snap scrolling, and that cards do not imply drag and drop.
7. Open `/changelog`, switch light/dark/system themes, enable reduced motion, and complete navigation, search/filter, creation, editing, confirmation, and withdrawal using only the keyboard. Record any failure before giving the green light; the portal UI phase remains open until this entire path passes.
