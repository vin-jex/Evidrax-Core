import Redis from "ioredis";
import config from "../config";
import logger from "../utils/logger";

let client: Redis | null = null;
let connected = false;

export function getRedis(): Redis {
  if (client) return client;

  client = new Redis(config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  client.on("connect", () => {
    connected = true;
    logger.info("Redis connected");
  });

  client.on("error", (err: Error) => {
    connected = false;
    logger.warn("Redis unavailable - running without cache", {
      error: err.message,
    });
  });

  client.connect().catch(() => {});
  return client;
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!connected) return null;
    const val = await redis.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!connected) return;
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // silent
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!connected) return;
    await redis.del(key);
  } catch {
    // silent
  }
}
