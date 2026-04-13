import { Router } from 'express';
import { Pool } from 'pg';
import { AuthService } from '../services/authService';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { sensitiveLimiter } from '../middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '../validators/auth.validators';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const authService = new AuthService(pool);

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', sensitiveLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

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
router.post('/login', sensitiveLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

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
router.patch('/profile', authMiddleware(pool), validateBody(updateProfileSchema), async (req, res) => {
  try {
    const updates = req.body;
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
router.post('/change-password', authMiddleware(pool), validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
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

/**
 * GET /api/auth/oauth/authorize?provider=AppleOAuth|GoogleOAuth
 * Returns the WorkOS authorization URL for the requested provider.
 */
router.get('/oauth/authorize', (req, res) => {
  const { provider } = req.query;

  if (provider !== 'AppleOAuth' && provider !== 'GoogleOAuth') {
    return res.status(400).json({ error: 'provider must be AppleOAuth or GoogleOAuth' });
  }

  try {
    const url = authService.getOAuthUrl(provider);
    res.json({ url });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

/**
 * GET /api/auth/callback
 * WorkOS redirect target. Exchanges code for user, issues JWT,
 * then redirects to the app deep link: com.vera.app://auth?token=JWT
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('WorkOS OAuth error:', error, error_description);
    return res.redirect(`com.vera.app://auth?error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('com.vera.app://auth?error=missing_code');
  }

  try {
    const { token } = await authService.findOrCreateWorkOSUser(code);
    res.redirect(`com.vera.app://auth?token=${token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('com.vera.app://auth?error=auth_failed');
  }
});

export default router;
