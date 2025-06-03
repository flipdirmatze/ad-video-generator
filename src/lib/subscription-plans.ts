// Typen für Abonnementpläne
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'business';

// Limits für jeden Plan
export interface PlanLimits {
  maxVideosPerMonth: number;
  maxVideoLength: number; // in Sekunden
  maxStorageSpace: number; // in MB
  maxResolution: string;
  maxUploadSize: number; // in MB
  allowedFeatures: string[];
}

// Definition der Limits für jeden Plan
export const planLimits: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxVideosPerMonth: 0,
    maxVideoLength: 0,
    maxStorageSpace: 0,
    maxResolution: 'none',
    maxUploadSize: 0,
    allowedFeatures: []
  },
  starter: {
    maxVideosPerMonth: 10,
    maxVideoLength: 180, // 3 Minuten
    maxStorageSpace: 2048, // 2 GB
    maxResolution: '720p',
    maxUploadSize: 150,
    allowedFeatures: ['basic_editing', 'voiceover', 'video_upload']
  },
  pro: {
    maxVideosPerMonth: 50,
    maxVideoLength: 600, // 10 Minuten
    maxStorageSpace: 10240, // 10 GB
    maxResolution: '1080p',
    maxUploadSize: 500,
    allowedFeatures: ['basic_editing', 'advanced_editing', 'voiceover', 'video_upload', 'analytics']
  },
  business: {
    maxVideosPerMonth: 200,
    maxVideoLength: 1800, // 30 Minuten
    maxStorageSpace: 51200, // 50 GB
    maxResolution: '4K',
    maxUploadSize: 2048, // 2 GB
    allowedFeatures: ['basic_editing', 'advanced_editing', 'voiceover', 'video_upload', 'analytics', 'team_access', 'priority_support']
  }
}; 