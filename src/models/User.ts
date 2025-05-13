import mongoose, { Schema } from 'mongoose';

// 1. Interfaces und Typen
export type SubscriptionPlan = 'starter' | 'pro' | 'business';

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
  maxUploadSize: number; // in Bytes
  allowedFeatures: string[]; // z.B. ["voiceover", "templates", "customBranding"]
}

// 1. Create an interface representing a document in MongoDB
export interface IUser {
  name: string;
  email: string;
  password?: string; // Password is optional for OAuth users
  image?: string;
  emailVerified?: Date;
  verificationToken?: string; // Für den E-Mail-Verifizierungslink
  verificationTokenExpires?: Date; // Ablaufzeit des Tokens
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
  starter: {
    maxVideosPerMonth: 10,
    maxVideoLength: 180, // 3 Minuten
    maxStorageSpace: 1024 * 1024 * 1024 * 2, // 2 GB
    maxResolution: "720p", // SD
    maxUploadSize: 150 * 1024 * 1024, // 150MB
    allowedFeatures: ["templates"]
  },
  pro: {
    maxVideosPerMonth: 50,
    maxVideoLength: 600, // 10 Minuten
    maxStorageSpace: 1024 * 1024 * 1024 * 10, // 10 GB
    maxResolution: "1080p", // HD
    maxUploadSize: 500 * 1024 * 1024, // 500MB
    allowedFeatures: ["templates"]
  },
  business: {
    maxVideosPerMonth: 200,
    maxVideoLength: 1800, // 30 Minuten
    maxStorageSpace: 1024 * 1024 * 1024 * 50, // 50 GB
    maxResolution: "2160p", // 4K
    maxUploadSize: 2 * 1024 * 1024 * 1024, // 2GB
    allowedFeatures: ["templates"]
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
      type: Date,
      default: null // Nicht mehr automatisch auf das aktuelle Datum setzen
    },
    verificationToken: {
      type: String,
      default: null
    },
    verificationTokenExpires: {
      type: Date,
      default: null
    },
    role: { 
      type: String, 
      enum: ['user', 'admin'], 
      default: 'user' 
    },
    subscriptionPlan: {
      type: String,
      enum: ['starter', 'pro', 'business'],
      default: 'starter'
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
        maxUploadSize: Number,
        allowedFeatures: [String]
      },
      default: function() {
        return planLimits.starter;
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