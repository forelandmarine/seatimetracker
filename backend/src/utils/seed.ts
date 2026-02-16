/**
 * Database seeding utilities for test data and default users
 */

import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';

/**
 * Hash password using PBKDF2 with SHA-256
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  return `${salt}:${iterations}:${hash}`;
}

/**
 * Seed test user for development/testing
 */
export async function seedTestUser(app: App): Promise<void> {
  try {
    const testEmail = 'test@seatime.com';
    const testName = 'Test User';
    const testPassword = 'testpassword123';

    // Check if test user already exists
    const existingUsers = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, testEmail));

    if (existingUsers.length > 0) {
      app.logger.debug({ email: testEmail }, 'Test user already exists, skipping seed');
      return;
    }

    app.logger.info({ email: testEmail }, 'Creating test user for development');

    // Create the test user
    const userId = crypto.randomUUID();
    const [user] = await app.db
      .insert(authSchema.user)
      .values({
        id: userId,
        email: testEmail,
        name: testName,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    app.logger.info({ userId: user.id, email: testEmail }, 'Test user created');

    // Create password account for the test user
    const hashedPassword = hashPassword(testPassword);
    const accountId = crypto.randomUUID();
    const [account] = await app.db
      .insert(authSchema.account)
      .values({
        id: accountId,
        accountId: testEmail,
        providerId: 'email',
        userId: user.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    app.logger.info(
      { userId: user.id, email: testEmail },
      `Test user password account created - can now sign in with email: ${testEmail}, password: ${testPassword}`
    );
  } catch (error) {
    app.logger.error({ err: error }, 'Error seeding test user');
    // Don't throw - allow app to continue even if seeding fails
  }
}

/**
 * Seed sandbox user for RevenueCat testing
 */
export async function seedSandboxUser(app: App): Promise<void> {
  try {
    const sandboxEmail = 'sandboxuser@seatime.com';
    const sandboxName = 'Sandbox Test User';
    const sandboxPassword = 'Testpassword123';

    // Check if sandbox user already exists
    const existingUsers = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, sandboxEmail));

    if (existingUsers.length > 0) {
      app.logger.debug({ email: sandboxEmail }, 'Sandbox user already exists, skipping seed');
      return;
    }

    app.logger.info({ email: sandboxEmail }, 'Creating sandbox user for RevenueCat testing');

    // Create the sandbox user
    const userId = crypto.randomUUID();
    const [user] = await app.db
      .insert(authSchema.user)
      .values({
        id: userId,
        email: sandboxEmail,
        name: sandboxName,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    app.logger.info({ userId: user.id, email: sandboxEmail }, 'Sandbox user created');

    // Create password account for the sandbox user
    const hashedPassword = hashPassword(sandboxPassword);
    const accountId = crypto.randomUUID();
    const [account] = await app.db
      .insert(authSchema.account)
      .values({
        id: accountId,
        accountId: sandboxEmail,
        providerId: 'email',
        userId: user.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    app.logger.info(
      { userId: user.id, email: sandboxEmail },
      `Sandbox user password account created - can now sign in with email: ${sandboxEmail}, password: ${sandboxPassword}`
    );
  } catch (error) {
    app.logger.error({ err: error }, 'Error seeding sandbox user');
    // Don't throw - allow app to continue even if seeding fails
  }
}
