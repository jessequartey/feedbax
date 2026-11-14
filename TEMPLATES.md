# Community Notion templates

Make Feedbax feel at home in your workspace. Extra properties, views and styling are welcome.

## Keep the schema

Keep these property names, types and select options exactly as written. The source is `NOTION_SCHEMA` in [notion-schema.ts](src/integrations/notion-schema.ts). Colors can change.

| Property       | Notion API type | Required select options                       |
| -------------- | --------------- | --------------------------------------------- |
| Name           | `title`         | —                                             |
| Feedbax ID     | `rich_text`     | —                                             |
| Description    | `rich_text`     | —                                             |
| Category       | `select`        | Feature request, Bug report, General feedback |
| Status         | `select`        | Open, Planned, In progress, Done, Closed      |
| Send to GitHub | `checkbox`      | —                                             |
| Votes          | `number`        | —                                             |
| Comments       | `number`        | —                                             |
| Author         | `rich_text`     | —                                             |
| Portal         | `url`           | —                                             |
| GitHub         | `url`           | —                                             |
| Images         | `files`         | —                                             |
| Created        | `date`          | —                                             |

Keep Number format for Votes and Comments. Extra select options are allowed, but Feedbax only uses its built-in statuses and categories. Leave Feedbax ID empty on example rows so sync ignores them.

## Test your template

1. Publish the page and enable **Allow duplicate as template**.
2. Duplicate the public template into your workspace and connect your Notion integration, following the [setup guide](README.md#get-started).
3. Run `npx create-feedbax@latest`. Confirm setup detects the duplicated Feedbax database, rather than offering to create a new one. Finish setup and check a test post syncs.

## Share it

Open a pull request adding one row below: template name, public duplicate link, a screenshot saved under `docs/templates/`, a short description and author. Check duplication from a signed-out browser before submitting. Keep the screenshot free of private data.

| Name             | Public link                                                                                | Screenshot               | Description                                   | Author                                           |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------- | ------------------------------------------------ |
| Official Feedbax | [Duplicate](https://brave-number-c98.notion.site/Feedbax-418afe159691807c8805db7a942aedcc) | [Preview](docs/hero.png) | Board, inbox, calendar and GitHub queue views | [Jesse Quartey](https://github.com/jessequartey) |
