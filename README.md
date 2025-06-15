# Feedbax

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Notion API](https://img.shields.io/badge/Notion-API-black)](https://developers.notion.com/)

Feedbax is an open-source feedback and roadmap system built with Next.js and Notion. It provides a Featurebase-style interface for collecting and managing user feedback while leveraging Notion as the backend database.

## Features

- 📝 Submit and manage feedback items
- 👍 Upvote and comment on suggestions
- 🗺️ Public roadmap view
- 🔄 Real-time updates via Notion webhooks
- 🎨 Modern UI with Shadcn UI and Tailwind CSS
- 🔒 Lightweight SSO integration
- 📱 Mobile-first responsive design
- 🚀 Built with Next.js 14 and TypeScript

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- A Notion account and workspace
- Basic knowledge of Next.js and TypeScript

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/feedbax.git
   cd feedbax
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in your Notion API key and database ID in `.env.local`.

4. Set up Notion:

   - Create a new integration in [Notion Integrations](https://www.notion.so/my-integrations)
   - Create a new database in your Notion workspace
   - Share the database with your integration
   - Copy the database ID and integration token

5. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Environment Variables

```env
NOTION_API_KEY=your_integration_token
NOTION_FEEDBACK_DB_ID=your_database_id
NEXT_PUBLIC_APP_URL=your_app_url
```

### Notion Database Setup

1. Create a new database in Notion with the following properties:

   - Title (title property)
   - Description (rich text)
   - Type/Category (select)
   - Status (select)
   - Votes (number)
   - Submitter (text)
   - Tags (multi-select)
   - Merged Into (relation)

2. Share the database with your integration

## Usage

### Feedback Management

- Users can submit new feedback items
- Vote on existing suggestions
- Comment on feedback items
- View the public roadmap
- Track feature status

### Admin Features

- Manage feedback directly in Notion
- Update status and categories
- Merge duplicate requests
- Respond to feedback via Notion comments
- Organize with tags

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development

### Tech Stack

- [Next.js](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Shadcn UI](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Notion API](https://developers.notion.com/) - Backend database

### Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run test       # Run tests
```

## Deployment

Feedbax is designed to be deployed on Cloudflare Pages using Wrangler. See our [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [Featurebase](https://featurebase.com/)
- Built with [Next.js](https://nextjs.org/)
- Powered by [Notion](https://notion.so/)

## Support

- [Documentation](docs/)
- [Issues](https://github.com/yourusername/feedbax/issues)
- [Discussions](https://github.com/yourusername/feedbax/discussions)

## Roadmap

See our [Roadmap](docs/ROADMAP.md) for planned features and improvements.

## Cloudflare integration

Besides the `dev` script mentioned above `c3` has added a few extra scripts that allow you to integrate the application with the [Cloudflare Pages](https://pages.cloudflare.com/) environment, these are:

- `pages:build` to build the application for Pages using the [`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages) CLI
- `preview` to locally preview your Pages application using the [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- `deploy` to deploy your Pages application using the [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI

> **Note:** while the `dev` script is optimal for local development you should preview your Pages application as well (periodically or before deployments) in order to make sure that it can properly work in the Pages environment (for more details see the [`@cloudflare/next-on-pages` recommended workflow](https://github.com/cloudflare/next-on-pages/blob/main/internal-packages/next-dev/README.md#recommended-development-workflow))

### Bindings

Cloudflare [Bindings](https://developers.cloudflare.com/pages/functions/bindings/) are what allows you to interact with resources available in the Cloudflare Platform.

You can use bindings during development, when previewing locally your application and of course in the deployed application:

- To use bindings in dev mode you need to define them in the `next.config.js` file under `setupDevBindings`, this mode uses the `next-dev` `@cloudflare/next-on-pages` submodule. For more details see its [documentation](https://github.com/cloudflare/next-on-pages/blob/05b6256/internal-packages/next-dev/README.md).

- To use bindings in the preview mode you need to add them to the `pages:preview` script accordingly to the `wrangler pages dev` command. For more details see its [documentation](https://developers.cloudflare.com/workers/wrangler/commands/#dev-1) or the [Pages Bindings documentation](https://developers.cloudflare.com/pages/functions/bindings/).

- To use bindings in the deployed application you will need to configure them in the Cloudflare [dashboard](https://dash.cloudflare.com/). For more details see the [Pages Bindings documentation](https://developers.cloudflare.com/pages/functions/bindings/).

#### KV Example

`c3` has added for you an example showing how you can use a KV binding.

In order to enable the example:

- Search for javascript/typescript lines containing the following comment:
  ```ts
  // KV Example:
  ```
  and uncomment the commented lines below it (also uncomment the relevant imports).
- In the `wrangler.jsonc` file add the following configuration line:
  ```
  "kv_namespaces": [{ "binding": "MY_KV_NAMESPACE", "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
  ```
- If you're using TypeScript run the `cf-typegen` script to update the `env.d.ts` file:
  ```bash
  npm run cf-typegen
  # or
  yarn cf-typegen
  # or
  pnpm cf-typegen
  # or
  bun cf-typegen
  ```

After doing this you can run the `dev` or `preview` script and visit the `/api/hello` route to see the example in action.

Finally, if you also want to see the example work in the deployed application make sure to add a `MY_KV_NAMESPACE` binding to your Pages application in its [dashboard kv bindings settings section](https://dash.cloudflare.com/?to=/:account/pages/view/:pages-project/settings/functions#kv_namespace_bindings_section). After having configured it make sure to re-deploy your application.
