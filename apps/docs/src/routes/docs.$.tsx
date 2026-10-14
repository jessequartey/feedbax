import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { getMDXComponents } from "../components/mdx";
import { baseOptions } from "../lib/layout";
import { source } from "../lib/source";

export const Route = createFileRoute("/docs/$")({
  head: ({ params }) => {
    const page = source.getPage(
      params._splat?.split("/").filter(Boolean) ?? [],
    );
    if (!page) return {};
    return {
      meta: [
        { title: `${page.data.title} — Feedbax Docs` },
        { name: "description", content: page.data.description },
      ],
      links: [{ rel: "canonical", href: `https://feedbax.dev${page.url}` }],
    };
  },
  component: DocsRoute,
});

function DocsRoute() {
  const params = Route.useParams();
  const page = source.getPage(params._splat?.split("/").filter(Boolean) ?? []);
  if (!page) throw notFound();
  const MDX = page.data.body;
  return (
    <DocsLayout tree={source.pageTree} {...baseOptions()}>
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
