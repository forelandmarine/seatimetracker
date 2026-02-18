/**
 * Users routes - REMOVED
 *
 * All authentication has been removed from the application.
 * This file is kept as an empty module to avoid import errors.
 */

import type { FastifyInstance } from "fastify";
import type { App } from "../index.js";

export function register(app: App, fastify: FastifyInstance) {
  // All user/auth endpoints have been removed for public API
}
