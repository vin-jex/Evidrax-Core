import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import prisma from "../config/prisma";
import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}

interface JwtPayload {
  sub: string;
  role: string;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      algorithms: [config.jwt.algorithm],
    }) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(
  ...roles: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role(s): ${roles.join(", ")}`,
      });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireInvestigatorOrAdmin = requireRole("INVESTIGATOR", "ADMIN");
export const requireAnyRole = requireRole("ADMIN", "INVESTIGATOR", "AUDITOR");
