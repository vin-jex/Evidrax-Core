/**
 * Client for the FastAPI AI compute service.
 *
 * Contract:
 *   - We POST log batches, get back anomaly scores.
 *   - FastAPI does NOT write to the DB. We do.
 *   - FastAPI does NOT know about users. userId is an opaque string to it.
 *   - We authenticate our callers before deciding whether to call FastAPI.
 */
import axios from "axios";
import config from "../config";
import logger from "../utils/logger";

export interface LogEntry {
  userId: string;
  timestamp: string;
  action: string;
  evidenceId?: string;
}

export interface AnomalyDetail {
  userId: string;
  anomaly: boolean;
  riskLevel: string;
  score: number;
  features: {
    access_count: number;
    is_off_hours: boolean;
    action_entropy?: number;
  };
}

export interface AnalyzeResult {
  anomalyDetected: boolean;
  riskLevel: string;
  score: number;
  details: AnomalyDetail[];
  analyzedAt: string;
}

const client = axios.create({
  baseURL: config.fastapi.baseUrl,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.response.use(
  (res) => res,
  (err: {
    response?: { data?: { detail?: string } };
    message: string;
    config?: { url: string };
  }) => {
    const detail = err.response?.data?.detail ?? err.message;
    logger.error("FastAPI request failed", { detail, url: err.config?.url });
    return Promise.reject(err);
  },
);

export async function analyzeAnomalies(
  logs: LogEntry[],
): Promise<AnalyzeResult> {
  const { data } = await client.post<AnalyzeResult>("/analyze", { logs });
  return data;
}

export async function trainModel(
  logs: LogEntry[],
): Promise<{ status: string; samples: number }> {
  const { data } = await client.post("/train", { logs });
  return data;
}

export async function ping(): Promise<{
  ok: boolean;
  service: string | null;
  env: string | null;
}> {
  try {
    logger.info("Pinging FastAPI", {
      url: `${config.fastapi.baseUrl}/health`,
    });

    const { data } = await client.get("/health");

    logger.info("FastAPI health check response", { data });

    return {
      ok: data.status === "ok",
      service: data.service || null,
      env: data.env || null,
    };
  } catch (err) {
    logger.error("FastAPI health check failed", {
      error: err,
    });

    return { ok: false, service: null, env: null };
  }
}
