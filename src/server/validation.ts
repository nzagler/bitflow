import { z } from "zod";

export const qbittorrentSchema = z.object({
  hostUrl: z.string().trim().url().or(z.literal("")),
  urlBase: z.string().trim().max(500).refine((value) => value === "" || value.startsWith("/"), "URL base must be empty or start with /"),
  apiKey: z.string().trim().max(500),
  throttledUploadLimit: z.coerce.number().int().min(1).max(10_000_000_000),
  throttledDownloadLimit: z.coerce.number().int().min(1).max(10_000_000_000),
  normalUploadLimit: z.coerce.number().int().min(1).max(10_000_000_000),
  normalDownloadLimit: z.coerce.number().int().min(1).max(10_000_000_000)
});

export const webhookSchema = z.object({
  enabled: z.coerce.boolean(),
  token: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9-_]+$/),
  secret: z.string().max(500),
  activityWindowSeconds: z.coerce.number().int().min(2).max(3600)
});

export const automationSchema = z.object({
  inactivityTimeoutMinutes: z.coerce.number().int().min(1).max(1440),
  pingIntervalSeconds: z.coerce.number().int().min(5).max(3600),
  evaluationIntervalSeconds: z.coerce.number().int().min(3).max(300)
});

export const monitoringSchema = z.object({
  enabled: z.coerce.boolean()
});

export const deviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  enabled: z.coerce.boolean()
});
