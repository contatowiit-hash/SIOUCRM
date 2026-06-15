import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env.js';

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET);

export interface AccessPayload {
  sub: string;
  restaurantId: string;
  role: string;
  email: string;
}

export const signAccessToken = async (payload: AccessPayload) =>
  new SignJWT({ restaurantId: payload.restaurantId, role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);

export const signRefreshToken = async (sessionId: string, userId: string) =>
  new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret);

export const verifyAccessToken = async (token: string) => {
  const { payload } = await jwtVerify(token, accessSecret);
  return {
    userId: payload.sub!,
    restaurantId: payload.restaurantId as string,
    role: payload.role as string,
    email: payload.email as string,
  };
};

export const verifyRefreshToken = async (token: string) => {
  const { payload } = await jwtVerify(token, refreshSecret);
  return {
    userId: payload.sub!,
    sessionId: payload.sid as string,
  };
};
