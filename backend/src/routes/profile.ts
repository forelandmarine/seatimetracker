import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/profile - Get current user's profile
  fastify.get(
    '/api/profile',
    {
      schema: {
        description: 'Get current authenticated user profile with all details',
        tags: ['profile'],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              emailVerified: { type: 'boolean' },
              image: { type: ['string', 'null'] },
              imageUrl: { type: ['string', 'null'] },
              address: { type: ['string', 'null'] },
              tel_no: { type: ['string', 'null'] },
              date_of_birth: { type: ['string', 'null'] },
              srb_no: { type: ['string', 'null'] },
              nationality: { type: ['string', 'null'] },
              pya_membership_no: { type: ['string', 'null'] },
              department: { type: ['string', 'null'], enum: ['deck', 'engineering'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      app.logger.info({}, 'Profile request');

      // Get token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({}, 'Profile request without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find session by token
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({}, 'Invalid token for profile request');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ sessionId: session.id }, 'Session expired for profile request');
        return reply.code(401).send({ error: 'Session expired' });
      }

      // Get user
      const users = await app.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, session.userId));

      if (users.length === 0) {
        app.logger.warn({ userId: session.userId }, 'User not found for profile');
        return reply.code(401).send({ error: 'User not found' });
      }

      const user = users[0];

      // Generate signed URL for profile image if it exists
      let imageUrl: string | null = null;
      if (user.image) {
        try {
          const { url } = await app.storage.getSignedUrl(user.image);
          imageUrl = url;
          app.logger.debug({ userId: user.id, imageKey: user.image }, 'Generated signed URL for profile image');
        } catch (error) {
          app.logger.warn({ userId: user.id, imageKey: user.image, err: error }, 'Failed to generate signed URL for profile image');
        }
      }

      app.logger.info({ userId: user.id, email: user.email }, 'Profile retrieved successfully');

      return reply.code(200).send({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        imageUrl,
        address: user.address || null,
        tel_no: user.tel_no || null,
        date_of_birth: user.date_of_birth || null,
        srb_no: user.srb_no || null,
        nationality: user.nationality || null,
        pya_membership_no: user.pya_membership_no || null,
        department: user.department || null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    }
  );

  // PUT /api/profile - Update user profile (name, email, maritime fields, and department)
  fastify.put<{
    Body: {
      name?: string;
      email?: string;
      address?: string;
      tel_no?: string;
      date_of_birth?: string;
      srb_no?: string;
      nationality?: string;
      pya_membership_no?: string;
      department?: string;
    };
  }>(
    '/api/profile',
    {
      schema: {
        description: 'Update user profile information including maritime details',
        tags: ['profile'],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
            address: { type: 'string' },
            tel_no: { type: 'string' },
            date_of_birth: { type: 'string', format: 'date', description: 'Date in YYYY-MM-DD format' },
            srb_no: { type: 'string' },
            nationality: { type: 'string' },
            pya_membership_no: { type: 'string' },
            department: { type: 'string', enum: ['deck', 'engineering'], description: 'Department: deck or engineering' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              emailVerified: { type: 'boolean' },
              image: { type: ['string', 'null'] },
              imageUrl: { type: ['string', 'null'] },
              address: { type: ['string', 'null'] },
              tel_no: { type: ['string', 'null'] },
              date_of_birth: { type: ['string', 'null'] },
              srb_no: { type: ['string', 'null'] },
              nationality: { type: ['string', 'null'] },
              pya_membership_no: { type: ['string', 'null'] },
              department: { type: ['string', 'null'], enum: ['deck', 'engineering'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          409: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { name, email, address, tel_no, date_of_birth, srb_no, nationality, pya_membership_no, department } = request.body;

      app.logger.info({ name, email, address, tel_no, date_of_birth, srb_no, nationality, pya_membership_no, department }, 'Profile update request');

      // Get token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({}, 'Profile update without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find session by token
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({}, 'Invalid token for profile update');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ sessionId: session.id }, 'Session expired for profile update');
        return reply.code(401).send({ error: 'Session expired' });
      }

      // Get user
      const users = await app.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, session.userId));

      if (users.length === 0) {
        app.logger.warn({ userId: session.userId }, 'User not found for profile update');
        return reply.code(401).send({ error: 'User not found' });
      }

      const user = users[0];

      // Validate department if provided
      if (department && !['deck', 'engineering'].includes(department)) {
        app.logger.warn({ userId: user.id, department }, 'Invalid department provided');
        return reply.code(400).send({ error: 'Invalid department. Must be "deck" or "engineering"' });
      }

      // Validate input - at least one field must be provided
      if (!name && !email && !address && !tel_no && !date_of_birth && !srb_no && !nationality && !pya_membership_no && !department) {
        app.logger.warn({ userId: user.id }, 'Profile update with no changes requested');
        return reply.code(400).send({ error: 'At least one field must be provided' });
      }

      // If email is being changed, check for duplicates
      if (email && email !== user.email) {
        const existingEmail = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (existingEmail.length > 0) {
          app.logger.warn({ email }, 'Email already in use');
          return reply.code(409).send({ error: 'Email already in use' });
        }
      }

      // Update user
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (address !== undefined) updateData.address = address || null;
      if (tel_no !== undefined) updateData.tel_no = tel_no || null;
      if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth || null;
      if (srb_no !== undefined) updateData.srb_no = srb_no || null;
      if (nationality !== undefined) updateData.nationality = nationality || null;
      if (pya_membership_no !== undefined) updateData.pya_membership_no = pya_membership_no || null;
      if (department !== undefined) updateData.department = department || null;

      const [updatedUser] = await app.db
        .update(authSchema.user)
        .set(updateData)
        .where(eq(authSchema.user.id, user.id))
        .returning();

      // Generate signed URL for profile image if it exists
      let imageUrl: string | null = null;
      if (updatedUser.image) {
        try {
          const { url } = await app.storage.getSignedUrl(updatedUser.image);
          imageUrl = url;
        } catch (error) {
          app.logger.warn({ userId: updatedUser.id, imageKey: updatedUser.image, err: error }, 'Failed to generate signed URL for profile image');
        }
      }

      app.logger.info(
        { userId: updatedUser.id, updatedFields: Object.keys(updateData) },
        'Profile updated successfully'
      );

      return reply.code(200).send({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        imageUrl,
        address: updatedUser.address || null,
        tel_no: updatedUser.tel_no || null,
        date_of_birth: updatedUser.date_of_birth || null,
        srb_no: updatedUser.srb_no || null,
        nationality: updatedUser.nationality || null,
        pya_membership_no: updatedUser.pya_membership_no || null,
        department: updatedUser.department || null,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      });
    }
  );

  // PUT /api/profile/department - Update user's department/pathway
  fastify.put<{ Body: { department: string } }>(
    '/api/profile/department',
    {
      schema: {
        description: 'Update user department/pathway (Deck or Engineering) - required for first-time setup',
        tags: ['profile'],
        body: {
          type: 'object',
          required: ['department'],
          properties: {
            department: { type: 'string', enum: ['deck', 'engineering'], description: 'Department pathway: deck or engineering' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              emailVerified: { type: 'boolean' },
              image: { type: ['string', 'null'] },
              imageUrl: { type: ['string', 'null'] },
              address: { type: ['string', 'null'] },
              tel_no: { type: ['string', 'null'] },
              date_of_birth: { type: ['string', 'null'] },
              srb_no: { type: ['string', 'null'] },
              nationality: { type: ['string', 'null'] },
              pya_membership_no: { type: ['string', 'null'] },
              department: { type: ['string', 'null'], enum: ['deck', 'engineering'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { department } = request.body;

      app.logger.info({ department }, 'Department selection request');

      // Validate department is provided
      if (!department || !['deck', 'engineering'].includes(department)) {
        app.logger.warn({ department }, 'Invalid department provided');
        return reply.code(400).send({ error: 'Invalid department. Must be "deck" or "engineering"' });
      }

      // Get token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({}, 'Department update without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find session by token
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({}, 'Invalid token for department update');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ sessionId: session.id }, 'Session expired for department update');
        return reply.code(401).send({ error: 'Session expired' });
      }

      // Get user
      const users = await app.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, session.userId));

      if (users.length === 0) {
        app.logger.warn({ userId: session.userId }, 'User not found for department update');
        return reply.code(401).send({ error: 'User not found' });
      }

      const user = users[0];

      // Update user department
      const [updatedUser] = await app.db
        .update(authSchema.user)
        .set({
          department,
          updatedAt: new Date(),
        })
        .where(eq(authSchema.user.id, user.id))
        .returning();

      // Generate signed URL for profile image if it exists
      let imageUrl: string | null = null;
      if (updatedUser.image) {
        try {
          const { url } = await app.storage.getSignedUrl(updatedUser.image);
          imageUrl = url;
        } catch (error) {
          app.logger.warn({ userId: updatedUser.id, imageKey: updatedUser.image, err: error }, 'Failed to generate signed URL for profile image');
        }
      }

      app.logger.info(
        { userId: updatedUser.id, department },
        `Department updated successfully to: ${department}`
      );

      return reply.code(200).send({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        imageUrl,
        address: updatedUser.address || null,
        tel_no: updatedUser.tel_no || null,
        date_of_birth: updatedUser.date_of_birth || null,
        srb_no: updatedUser.srb_no || null,
        nationality: updatedUser.nationality || null,
        pya_membership_no: updatedUser.pya_membership_no || null,
        department: updatedUser.department || null,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      });
    }
  );

  // POST /api/profile/upload-image - Upload profile picture
  fastify.post(
    '/api/profile/upload-image',
    {
      schema: {
        description: 'Upload a profile picture for the authenticated user',
        tags: ['profile'],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              emailVerified: { type: 'boolean' },
              image: { type: ['string', 'null'] },
              imageUrl: { type: ['string', 'null'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          413: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      app.logger.info({}, 'Profile image upload request');

      // Get token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({}, 'Profile image upload without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find session by token
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({}, 'Invalid token for profile image upload');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ sessionId: session.id }, 'Session expired for profile image upload');
        return reply.code(401).send({ error: 'Session expired' });
      }

      // Get user
      const users = await app.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, session.userId));

      if (users.length === 0) {
        app.logger.warn({ userId: session.userId }, 'User not found for profile image upload');
        return reply.code(401).send({ error: 'User not found' });
      }

      const user = users[0];

      // Get file from request with 5MB size limit
      const options = { limits: { fileSize: 5 * 1024 * 1024 } };
      const data = await request.file(options);

      if (!data) {
        app.logger.warn({ userId: user.id }, 'No file provided in profile image upload');
        return reply.code(400).send({ error: 'No file provided' });
      }

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        app.logger.warn(
          { userId: user.id, mimetype: data.mimetype },
          'Invalid file type for profile image'
        );
        return reply.code(400).send({
          error: 'Invalid file type. Allowed types: JPEG, PNG, WebP, GIF',
        });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (error) {
        app.logger.warn({ userId: user.id, err: error }, 'File size exceeded for profile image');
        return reply.code(413).send({ error: 'File too large (max 5MB)' });
      }

      // Delete old image if exists
      if (user.image) {
        try {
          await app.storage.delete(user.image);
          app.logger.debug({ userId: user.id, oldImageKey: user.image }, 'Old profile image deleted');
        } catch (error) {
          app.logger.warn({ userId: user.id, oldImageKey: user.image, err: error }, 'Failed to delete old profile image');
        }
      }

      // Upload new image
      const imageKey = `profile-images/${user.id}/${Date.now()}-${data.filename}`;
      let uploadedKey: string;
      try {
        uploadedKey = await app.storage.upload(imageKey, buffer);
        app.logger.info({ userId: user.id, imageKey: uploadedKey }, 'Profile image uploaded successfully');
      } catch (error) {
        app.logger.error({ userId: user.id, imageKey, err: error }, 'Failed to upload profile image');
        return reply.code(400).send({ error: 'Failed to upload image' });
      }

      // Update user with new image key
      const [updatedUser] = await app.db
        .update(authSchema.user)
        .set({ image: uploadedKey, updatedAt: new Date() })
        .where(eq(authSchema.user.id, user.id))
        .returning();

      // Generate signed URL for the new image
      let imageUrl: string | null = null;
      try {
        const { url } = await app.storage.getSignedUrl(uploadedKey);
        imageUrl = url;
        app.logger.debug({ userId: user.id, imageKey: uploadedKey }, 'Generated signed URL for new profile image');
      } catch (error) {
        app.logger.warn({ userId: user.id, imageKey: uploadedKey, err: error }, 'Failed to generate signed URL for new profile image');
      }

      app.logger.info({ userId: updatedUser.id, imageKey: uploadedKey }, 'User profile updated with new image');

      return reply.code(200).send({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        imageUrl,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      });
    }
  );
}
