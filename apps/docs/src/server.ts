import handler from "@tanstack/react-start/server-entry";

import { search } from "./lib/search";

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/search") return search.GET(request);
    if (url.hostname === "www.feedbax.dev") {
      url.hostname = "feedbax.dev";
      return Response.redirect(url, 301);
    }
    return handler.fetch(request);
  },
};
