import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import type { User } from '@shared/schema';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function ensureSessionUser(req: Request, res: Response, next: NextFunction) {
  try {
    console.log(`[Auth] Processing request: ${req.method} ${req.path}, sessionID: ${req.sessionID?.substring(0, 8)}...`);
    
    if (!req.session.userId) {
      const sessionId = req.sessionID;
      console.log(`[Auth] No userId in session, looking up/creating user for session: ${sessionId?.substring(0, 8)}...`);
      
      let user = await storage.getUserBySessionId(sessionId);
      
      if (!user) {
        console.log(`[Auth] Creating new user for session: ${sessionId?.substring(0, 8)}...`);
        try {
          user = await storage.createUser({
            sessionId,
            isPremium: false,
            aiUsageCount: 0,
            aiUsageResetDate: new Date(),
          });
          console.log(`[Auth] Created user: ${user.id}`);
        } catch (createError: any) {
          // Handle race condition - if another request already created the user
          if (createError.code === '23505') {
            console.log(`[Auth] Race condition - fetching existing user`);
            user = await storage.getUserBySessionId(sessionId);
          } else {
            throw createError;
          }
        }
      } else {
        console.log(`[Auth] Found existing user: ${user.id}`);
      }
      
      if (user) {
        req.session.userId = user.id;
        // Force session save in production to ensure cookie is sent
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error('[Auth] Session save error:', err);
              reject(err);
            } else {
              console.log(`[Auth] Session saved with userId: ${user!.id}`);
              resolve();
            }
          });
        });
      }
    } else {
      console.log(`[Auth] Existing userId in session: ${req.session.userId}`);
    }
    
    next();
  } catch (error) {
    console.error('[Auth] Session user creation error:', error);
    res.status(500).json({ message: 'Session initialization failed' });
  }
}

export async function getCurrentUser(req: Request): Promise<User | null> {
  if (!req.session.userId) {
    return null;
  }
  
  const user = await storage.getUser(req.session.userId);
  return user || null;
}

export async function checkPremiumStatus(user: User): Promise<boolean> {
  if (!user.isPremium) {
    return false;
  }
  
  if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) < new Date()) {
    await storage.updateUserPremiumStatus(user.id, false);
    return false;
  }
  
  return true;
}

export async function checkAiUsageLimit(user: User): Promise<{ allowed: boolean; remaining: number }> {
  // All users have unlimited AI requests - premium subscription is optional
  return {
    allowed: true,
    remaining: 999999, // Unlimited
  };
}
