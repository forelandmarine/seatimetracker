/**
 * Error handling utilities for consistent error logging and responses
 */

import type { FastifyReply } from 'fastify';
import type { App } from '../index.js';

/**
 * Enum for error types
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DATABASE = 'DATABASE',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  INTERNAL = 'INTERNAL',
}

/**
 * Error details for logging
 */
export interface ErrorDetails {
  type: ErrorType;
  statusCode: number;
  message: string;
  error?: any;
  context?: Record<string, any>;
}

/**
 * Send error response with proper logging
 */
export async function sendError(
  app: App,
  reply: FastifyReply,
  details: ErrorDetails
): Promise<void> {
  const { type, statusCode, message, error, context = {} } = details;

  // Log the error
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  const logData = {
    errorType: type,
    statusCode,
    message,
    ...(error && { err: error }),
    ...context,
  };

  if (logLevel === 'error') {
    app.logger.error(logData, `${type}: ${message}`);
  } else if (logLevel === 'warn') {
    app.logger.warn(logData, `${type}: ${message}`);
  } else {
    app.logger.info(logData, `${type}: ${message}`);
  }

  // Send JSON response
  reply.type('application/json').code(statusCode).send({
    error: message,
  });
}

/**
 * Common error builders
 */
export const errors = {
  badRequest: (message: string, context?: Record<string, any>) => ({
    type: ErrorType.VALIDATION,
    statusCode: 400,
    message,
    context,
  }),

  unauthorized: (message: string = 'Unauthorized', context?: Record<string, any>) => ({
    type: ErrorType.AUTHENTICATION,
    statusCode: 401,
    message,
    context,
  }),

  forbidden: (message: string = 'Forbidden', context?: Record<string, any>) => ({
    type: ErrorType.AUTHORIZATION,
    statusCode: 403,
    message,
    context,
  }),

  notFound: (message: string = 'Not found', context?: Record<string, any>) => ({
    type: ErrorType.NOT_FOUND,
    statusCode: 404,
    message,
    context,
  }),

  conflict: (message: string, context?: Record<string, any>) => ({
    type: ErrorType.CONFLICT,
    statusCode: 409,
    message,
    context,
  }),

  internalError: (message: string = 'Internal server error', error?: any, context?: Record<string, any>) => ({
    type: ErrorType.INTERNAL,
    statusCode: 500,
    message,
    error,
    context,
  }),

  databaseError: (message: string, error?: any, context?: Record<string, any>) => ({
    type: ErrorType.DATABASE,
    statusCode: 500,
    message,
    error,
    context,
  }),

  externalServiceError: (message: string, error?: any, context?: Record<string, any>) => ({
    type: ErrorType.EXTERNAL_SERVICE,
    statusCode: 502,
    message,
    error,
    context,
  }),
};
