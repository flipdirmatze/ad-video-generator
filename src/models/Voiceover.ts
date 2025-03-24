import mongoose, { Schema, model, models, Document, Types } from 'mongoose';
import { IUser } from './User';

// Interface für Wort-Zeitstempel
export interface IWordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}

// 1. Create an interface representing a document in MongoDB
export interface IVoiceover extends Document {
  userId: mongoose.Types.ObjectId | IUser;
  name: string;
  text: string;
  url: string;
  path: string;
  size: number;
  duration?: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  wordTimestamps?: IWordTimestamp[]; // Neues Feld für Wort-Zeitstempel
  voiceId?: string; // Speichern der verwendeten ElevenLabs Stimmen-ID
}

// 2. Create a Schema corresponding to the document interface
const VoiceoverSchema = new Schema<IVoiceover>(
  {
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    name: { 
      type: String, 
      required: true 
    },
    text: { 
      type: String, 
      required: true 
    },
    url: { 
      type: String, 
      required: true 
    },
    path: { 
      type: String, 
      required: true 
    },
    size: { 
      type: Number, 
      required: true 
    },
    duration: { 
      type: Number 
    },
    isPublic: { 
      type: Boolean, 
      default: false 
    },
    wordTimestamps: {
      type: [{
        word: String,
        startTime: Number,
        endTime: Number
      }],
      default: []
    },
    voiceId: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true 
  }
);

// 3. Create a Model
const Voiceover = models.Voiceover || model<IVoiceover>('Voiceover', VoiceoverSchema);

export default Voiceover; 