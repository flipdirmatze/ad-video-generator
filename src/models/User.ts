import mongoose from 'mongoose';
import { Schema } from 'mongoose';

// Plan-Typen für den Benutzer
export type SubscriptionPlan = 'free' | 'premium' | 'enterprise';

// Statistische Daten des Benutzers
export interface IUserStats {
  totalVideosCreated: number;
  totalStorage: number; // in Bytes
  lastActive: Date;
}

// Nutzungslimits basierend auf dem Abonnement
export interface IUserLimits {
  maxVideosPerMonth: number;
  maxVideoLength: number; // in Sekunden
  maxStorageSpace: number; // in Bytes
  maxResolution: string; // z.B. "1080p"
  allowedFeatures: string[]; // z.B. ["voiceover", "templates", "customBranding"]
}

// 1. Create an interface representing a document in MongoDB
export interface IUser {
  name: string;
  email: string;
  password?: string; // Password is optional for OAuth users
  image?: string;
  emailVerified?: Date;
  username?: string; // Optional username für bessere Identifikation
  bio?: string; // Kurze Beschreibung
  role: 'user' | 'admin';
  subscriptionPlan: SubscriptionPlan;
  subscriptionActive: boolean;
  subscriptionExpiresAt?: Date; // Wann läuft das Abonnement ab?
  limits: IUserLimits;
  stats: IUserStats;
  preferences?: {
    language?: string;
    theme?: 'light' | 'dark' | 'system';
    emailNotifications?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Standardlimits für verschiedene Abonnements
const planLimits: Record<SubscriptionPlan, IUserLimits> = {
  free: {
    maxVideosPerMonth: 5,
    maxVideoLength: 60, // 1 Minute
    maxStorageSpace: 1024 * 1024 * 500, // 500 MB
    maxResolution: "720p",
    allowedFeatures: ["templates"]
  },
  premium: {
    maxVideosPerMonth: 50,
    maxVideoLength: 300, // 5 Minuten
    maxStorageSpace: 1024 * 1024 * 1024 * 5, // 5 GB
    maxResolution: "1080p",
    allowedFeatures: ["templates", "voiceover", "customBranding"]
  },
  enterprise: {
    maxVideosPerMonth: 1000,
    maxVideoLength: 1800, // 30 Minuten
    maxStorageSpace: 1024 * 1024 * 1024 * 50, // 50 GB
    maxResolution: "4K",
    allowedFeatures: ["templates", "voiceover", "customBranding", "apiAccess", "priorityProcessing"]
  }
};

// 2. Create a Schema corresponding to the document interface
const UserSchema = new Schema<IUser>(
  {
    name: { 
      type: String, 
      required: [true, 'Name is required'] 
    },
    email: { 
      type: String, 
      required: [true, 'Email is required'], 
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    },
    username: {
      type: String,
      sparse: true, // Allows multiple docs with undefined username
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_\-.]+$/i, 'Username can only contain letters, numbers, underscores, dots and hyphens']
    },
    password: { 
      type: String, // Hashed password, not required for OAuth users
    },
    image: { 
      type: String 
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters']
    },
    emailVerified: { 
      type: Date 
    },
    role: { 
      type: String, 
      enum: ['user', 'admin'], 
      default: 'user' 
    },
    subscriptionPlan: {
      type: String,
      enum: ['free', 'premium', 'enterprise'],
      default: 'free'
    },
    subscriptionActive: {
      type: Boolean,
      default: true
    },
    subscriptionExpiresAt: {
      type: Date
    },
    limits: {
      type: {
        maxVideosPerMonth: Number,
        maxVideoLength: Number,
        maxStorageSpace: Number,
        maxResolution: String,
        allowedFeatures: [String]
      },
      default: function() {
        return planLimits.free;
      }
    },
    stats: {
      type: {
        totalVideosCreated: {
          type: Number,
          default: 0
        },
        totalStorage: {
          type: Number,
          default: 0
        },
        lastActive: {
          type: Date,
          default: Date.now
        }
      },
      default: {
        totalVideosCreated: 0,
        totalStorage: 0,
        lastActive: new Date()
      }
    },
    preferences: {
      language: {
        type: String,
        default: 'de'
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system'
      },
      emailNotifications: {
        type: Boolean,
        default: true
      }
    }
  }, 
  { 
    timestamps: true 
  }
);

// Don't return the password when converting to JSON or Object
UserSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.password;
    return ret;
  }
});

// Methode zum Abrufen und Aktualisieren der Limits basierend auf dem Abonnement
UserSchema.methods.updateLimitsForPlan = function(plan: SubscriptionPlan) {
  this.limits = planLimits[plan];
  this.subscriptionPlan = plan;
  return this.save();
};

// Methode zum Überprüfen, ob ein Benutzer noch Videos erstellen kann
UserSchema.methods.canCreateVideo = function(lengthInSeconds: number) {
  const { maxVideosPerMonth, maxVideoLength } = this.limits;
  
  // Überprüfe, ob die Anzahl der erstellten Videos das Limit übersteigt
  if (this.stats.totalVideosCreated >= maxVideosPerMonth) {
    return {
      allowed: false,
      reason: 'Monthly video limit reached'
    };
  }
  
  // Überprüfe, ob die Videolänge das Limit übersteigt
  if (lengthInSeconds > maxVideoLength) {
    return {
      allowed: false,
      reason: 'Video length exceeds maximum allowed length'
    };
  }
  
  return {
    allowed: true
  };
};

// 3. Create a Model
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User; 