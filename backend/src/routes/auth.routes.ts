import { Router } from 'express';
import { Pool } from 'pg';
import { AuthService } from '../services/authService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const authService = new AuthService(pool);

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }

    const result = await authService.register({
      email,
      password,
      first_name,
      last_name
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Registration error:', error);

    if (error.message === 'User already exists with this email') {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to register user. Please try again.'
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const result = await authService.login({ email, password });

    res.json(result);
  } catch (error: any) {
    console.error('Login error:', error);

    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to login. Please try again.'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware(pool), async (req, res) => {
  try {
    const user = await authService.getUserById(req.userId!);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get user profile'
    });
  }
});

/**
 * PATCH /api/auth/profile
 * Update user profile
 */
router.patch('/profile', authMiddleware(pool), async (req, res) => {
  try {
    const { first_name, last_name, phone, preferred_language } = req.body;

    const updates: any = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (phone !== undefined) updates.phone = phone;
    if (preferred_language !== undefined) updates.preferred_language = preferred_language;

    const updatedUser = await authService.updateProfile(req.userId!, updates);

    res.json(updatedUser);
  } catch (error: any) {
    console.error('Update profile error:', error);

    if (error.message === 'No fields to update') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to update profile'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authMiddleware(pool), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'Current password and new password are required'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long'
      });
    }

    await authService.changePassword(req.userId!, current_password, new_password);

    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);

    if (error.message === 'Current password is incorrect') {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to change password'
    });
  }
});

export default router;
