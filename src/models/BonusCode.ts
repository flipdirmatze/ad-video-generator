import mongoose, { Schema, models, model } from 'mongoose';
import { IUser } from './User';
import { SubscriptionPlan } from '@/lib/subscription-plans';

// Interface für Bonus-Codes
export interface IBonusCode {
  code: string;
  plan: SubscriptionPlan;
  durationInDays: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId | IUser;
  usedBy: Array<{
    userId: mongoose.Types.ObjectId | IUser;
    usedAt: Date;
  }>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Schema für Bonus-Codes
const BonusCodeSchema = new Schema<IBonusCode>(
  {
    code: { 
      type: String, 
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    plan: { 
      type: String, 
      enum: ['starter', 'pro', 'business'],
      required: true,
      default: 'pro'
    },
    durationInDays: {
      type: Number,
      required: true,
      default: 90 // 3 Monate als Standard
    },
    maxUses: {
      type: Number,
      required: true,
      default: 1 // Standardmäßig einmalige Verwendung
    },
    usedCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    usedBy: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      usedAt: {
        type: Date,
        default: Date.now
      }
    }],
    expiresAt: {
      type: Date
    }
  },
  { 
    timestamps: true 
  }
);

// Methode zum Überprüfen, ob ein Code noch gültig ist
BonusCodeSchema.methods.isValid = function() {
  // Code ist nicht aktiv
  if (!this.isActive) {
    return {
      valid: false,
      reason: 'Code is not active'
    };
  }
  
  // Code ist abgelaufen
  if (this.expiresAt && new Date() > this.expiresAt) {
    return {
      valid: false,
      reason: 'Code has expired'
    };
  }
  
  // Maximale Nutzungen erreicht
  if (this.usedCount >= this.maxUses) {
    return {
      valid: false,
      reason: 'Code has reached maximum usage'
    };
  }
  
  return {
    valid: true,
    plan: this.plan,
    durationInDays: this.durationInDays
  };
};

// Methode zum Verwenden eines Codes
BonusCodeSchema.methods.useCode = function(userId: mongoose.Types.ObjectId) {
  // Prüfen, ob der Nutzer den Code bereits verwendet hat
  const alreadyUsed = this.usedBy.some((entry: { userId: mongoose.Types.ObjectId }) => 
    entry.userId.toString() === userId.toString()
  );
  
  if (alreadyUsed) {
    return {
      success: false,
      reason: 'User has already used this code'
    };
  }
  
  // Validitätsprüfung
  const validityCheck = this.isValid();
  if (!validityCheck.valid) {
    return {
      success: false,
      reason: validityCheck.reason
    };
  }
  
  // Code verwenden
  this.usedCount += 1;
  this.usedBy.push({
    userId,
    usedAt: new Date()
  });
  
  // Code deaktivieren, wenn maximale Nutzungen erreicht
  if (this.usedCount >= this.maxUses) {
    this.isActive = false;
  }
  
  return {
    success: true,
    plan: this.plan,
    durationInDays: this.durationInDays
  };
};

// Modell erstellen
const BonusCode = models.BonusCode || model<IBonusCode>('BonusCode', BonusCodeSchema);

export default BonusCode; 