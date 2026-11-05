// Route schemas carry OpenAPI doc fields (description, tags, summary) without
// @fastify/swagger installed, so FastifySchema needs them declared. Without this
// every route with a description fails overload matching and TypeScript falls
// back to the websocket handler signature, mistyping `reply` as a request.
import 'fastify';

declare module 'fastify' {
  interface FastifySchema {
    description?: string;
    summary?: string;
    tags?: string[];
    security?: unknown[];
    operationId?: string;
    deprecated?: boolean;
    hide?: boolean;
  }
}
