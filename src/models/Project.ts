import mongoose, { Schema } from 'mongoose';
import { IUser } from './User';

export interface IProject {
  userId: mongoose.Types.ObjectId | IUser;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  segments: Array<{
    videoId: string;
    videoKey: string;
    startTime: number;
    duration: number;
    position: number;
  }>;
  voiceoverId?: mongoose.Types.ObjectId | null;
  outputKey?: string;
  outputUrl?: string;
  batchJobId?: string;
  batchJobName?: string;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    required: true
  },
  segments: [{
    videoId: String,
    videoKey: String,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  voiceoverId: {
    type: Schema.Types.ObjectId,
    ref: 'Voiceover',
    default: null
  },
  outputKey: {
    type: String
  },
  outputUrl: {
    type: String
  },
  batchJobId: {
    type: String
  },
  batchJobName: {
    type: String
  },
  error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Verwende einen existierenden Mongoose-Model oder erstelle einen neuen
const Project = mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);

export default Project; 