import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { WorkOS } from '@workos-inc/node';
import { User, AuthRequest, AuthResponse } from '../models/types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export class AuthService {
  private pool: Pool;
  private workos: WorkOS;

  constructor(pool: Pool) {
    this.pool = pool;
    this.workos = new WorkOS(process.env.WORKOS_API_KEY!);
  }

  /**
   * Get WorkOS authorization URL for a given provider.
   * provider: 'AppleOAuth' | 'GoogleOAuth'
   */
  getOAuthUrl(provider: 'AppleOAuth' | 'GoogleOAuth'): string {
    return this.workos.userManagement.getAuthorizationUrl({
      provider,
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: process.env.WORKOS_REDIRECT_URI!,
    });
  }

  /**
   * Exchange a WorkOS auth code for a local JWT.
   * Upserts a user row keyed on workos_user_id.
   */
  async findOrCreateWorkOSUser(code: string): Promise<AuthResponse> {
    const { user: wu } = await this.workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    const result = await this.pool.query(
      `INSERT INTO users (email, first_name, last_name, workos_user_id, preferred_language)
       VALUES ($1, $2, $3, $4, 'en')
       ON CONFLICT (workos_user_id) DO UPDATE
         SET email      = EXCLUDED.email,
             first_name = COALESCE(EXCLUDED.first_name, users.first_name),
             last_name  = COALESCE(EXCLUDED.last_name,  users.last_name),
             updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, first_name, last_name, phone, preferred_language, created_at, updated_at`,
      [wu.email, wu.firstName ?? null, wu.lastName ?? null, wu.id]
    );

    const user: User = result.rows[0];
    const token = this.generateToken(user.id);
    return { token, user };
  }

  /**
   * Register a new user
   */
  async register(data: AuthRequest): Promise<AuthResponse> {
    const { email, password, first_name, last_name } = data;

    // Check if user already exists
    const existingUser = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User already exists with this email');
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const result = await this.pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, preferred_language)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, phone, preferred_language, created_at, updated_at`,
      [email.toLowerCase(), password_hash, first_name, last_name, 'en']
    );

    const user: User = result.rows[0];

    // Generate JWT token
    const token = this.generateToken(user.id);

    return { token, user };
  }

  /**
   * Login user
   */
  async login(data: AuthRequest): Promise<AuthResponse> {
    const { email, password } = data;

    // Find user
    const result = await this.pool.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, preferred_language, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const userWithPassword = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userWithPassword.password_hash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Remove password_hash from user object
    const { password_hash, ...user } = userWithPassword;

    // Generate JWT token
    const token = this.generateToken(user.id);

    return { token, user };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT id, email, first_name, last_name, phone, preferred_language, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: Partial<Pick<User, 'first_name' | 'last_name' | 'phone' | 'preferred_language'>>
  ): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    if (updates.first_name !== undefined) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(updates.first_name);
    }
    if (updates.last_name !== undefined) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(updates.last_name);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(updates.phone);
    }
    if (updates.preferred_language !== undefined) {
      fields.push(`preferred_language = $${paramIndex++}`);
      values.push(updates.preferred_language);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const result = await this.pool.query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, phone, preferred_language, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user with password hash
    const result = await this.pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const { password_hash } = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, password_hash);

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}
