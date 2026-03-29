import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, LoginRequest, LoginResponse, ApiResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

const generateTokens = (user: User): { accessToken: string; refreshToken: string } => {
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

router.post('/login', asyncHandler(async (req: express.Request<{}, ApiResponse<LoginResponse>, LoginRequest>, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }

  const user = await db<User>('users').where({ email, is_active: true }).first();
  
  if (!user || !await bcrypt.compare(password, user.password)) {
    throw createError('Invalid email or password', 401);
  }

  const { password: _, ...userWithoutPassword } = user;
  const tokens = generateTokens(userWithoutPassword);

  res.json({
    success: true,
    data: {
      user: userWithoutPassword,
      tokens: {
        ...tokens,
        expiresIn: 900 // 15 minutes
      }
    }
  });
}));

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, role, middleName, phone } = req.body;

  if (!email || !password || !firstName || !lastName || !role) {
    throw createError('Email, password, firstName, lastName, and role are required', 400);
  }

  const existingUser = await db<User>('users').where({ email }).first();
  if (existingUser) {
    throw createError('User with this email already exists', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [user] = await db<User>('users').insert({
    email,
    password: hashedPassword,
    firstName,
    lastName,
    middleName,
    phone,
    role,
    isActive: true
  }).returning('*');

  const { password: _, ...userWithoutPassword } = user;
  const tokens = generateTokens(userWithoutPassword);

  res.status(201).json({
    success: true,
    data: {
      user: userWithoutPassword,
      tokens: {
        ...tokens,
        expiresIn: 900
      }
    }
  });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw createError('Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
    
    const user = await db<User>('users').where({ id: decoded.id, is_active: true }).first();
    if (!user) {
      throw createError('User not found', 404);
    }

    const { password: _, ...userWithoutPassword } = user;
    const tokens = generateTokens(userWithoutPassword);

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        tokens: {
          ...tokens,
          expiresIn: 900
        }
      }
    });
  } catch (error) {
    throw createError('Invalid refresh token', 401);
  }
}));

router.get('/me', asyncHandler(async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    throw createError('Access token is required', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    const user = await db<User>('users').where({ id: decoded.id, is_active: true }).first();
    if (!user) {
      throw createError('User not found', 404);
    }

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    throw createError('Invalid access token', 401);
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

export default router;
