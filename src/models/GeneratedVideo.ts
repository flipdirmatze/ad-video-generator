import mongoose, { Schema } from 'mongoose';
import { IUser } from './User';
import { IVideo } from './Video';
import { IVoiceover } from './Voiceover';

// Segment-Schema für die Timeline
interface ISegment {
  videoId: mongoose.Types.ObjectId | IVideo;
  startTime: number;
  duration: number;
  position: number;
}

const SegmentSchema = new Schema<ISegment>({
  videoId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Video', 
    required: true 
  },
  startTime: { 
    type: Number, 
    required: true, 
    default: 0 
  },
  duration: { 
    type: Number, 
    required: true 
  },
  position: { 
    type: Number, 
    required: true 
  }
});

// 1. Create an interface representing a document in MongoDB
export interface IGeneratedVideo {
  userId: mongoose.Types.ObjectId | IUser;
  name: string;
  voiceoverId: mongoose.Types.ObjectId | IVoiceover;
  segments: ISegment[];
  url: string;
  path: string;
  size: number;
  duration?: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 2. Create a Schema corresponding to the document interface
const GeneratedVideoSchema = new Schema<IGeneratedVideo>(
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
    voiceoverId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Voiceover', 
      required: true 
    },
    segments: [SegmentSchema],
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
const GeneratedVideo = mongoose.models.GeneratedVideo || 
  mongoose.model<IGeneratedVideo>('GeneratedVideo', GeneratedVideoSchema);

export default GeneratedVideo; 