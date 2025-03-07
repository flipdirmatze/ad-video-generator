import mongoose, { Schema } from 'mongoose';
import { IUser } from './User';

// 1. Create an interface representing a document in MongoDB
export interface IVoiceover {
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
    }
  },
  { 
    timestamps: true 
  }
);

// 3. Create a Model
const Voiceover = mongoose.models.Voiceover || mongoose.model<IVoiceover>('Voiceover', VoiceoverSchema);

export default Voiceover; 