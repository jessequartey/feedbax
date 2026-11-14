// Keep W1's HTTP routes typecheckable before the integration build regenerates
// routeTree.gen.ts (owned by W0/W3). These match the generator's declarations.
import type { Route as rootRoute } from "../routes/__root.tsx";
import type { Route as health } from "../routes/api/health.ts";
import type { Route as posts } from "../routes/api/posts.ts";
import type { Route as auth } from "../routes/api/auth/$.ts";
import type { Route as media } from "../routes/api/media/$id.ts";
declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/api/health": {
      id: "/api/health";
      path: "/api/health";
      fullPath: "/api/health";
      preLoaderRoute: typeof health;
      parentRoute: typeof rootRoute;
    };
    "/api/posts": {
      id: "/api/posts";
      path: "/api/posts";
      fullPath: "/api/posts";
      preLoaderRoute: typeof posts;
      parentRoute: typeof rootRoute;
    };
    "/api/auth/$": {
      id: "/api/auth/$";
      path: "/api/auth/$";
      fullPath: "/api/auth/$";
      preLoaderRoute: typeof auth;
      parentRoute: typeof rootRoute;
    };
    "/api/media/$id": {
      id: "/api/media/$id";
      path: "/api/media/$id";
      fullPath: "/api/media/$id";
      preLoaderRoute: typeof media;
      parentRoute: typeof rootRoute;
    };
  }
}
