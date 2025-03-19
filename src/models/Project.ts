import mongoose, { Schema } from 'mongoose';
import { IUser } from './User';

export interface IProject {
  userId: mongoose.Types.ObjectId | IUser | string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  workflowStep?: 'voiceover' | 'upload' | 'matching' | 'editing' | 'processing' | 'completed';
  segments: Array<{
    videoId: string;
    videoKey: string;
    startTime: number;
    duration: number;
    position: number;
  }>;
  scriptSegments?: Array<{
    id: string;
    text: string;
    keywords: string[];
    duration: number;
  }>;
  matchedVideos?: Array<{
    videoId: string;
    segmentId: string;
    score: number;
    startTime: number;
    duration: number;
    position: number;
  }>;
  voiceoverId?: mongoose.Types.ObjectId | null;
  voiceoverScript?: string;
  outputKey?: string;
  outputUrl?: string;
  batchJobId?: string;
  batchJobName?: string;
  jobId?: string;
  error?: string | null;
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  userId: { 
    type: Schema.Types.Mixed,
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
  workflowStep: {
    type: String,
    enum: ['voiceover', 'upload', 'matching', 'editing', 'processing', 'completed'],
    default: 'voiceover'
  },
  segments: [{
    videoId: String,
    videoKey: String,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  scriptSegments: [{
    id: String,
    text: String,
    keywords: [String],
    duration: Number
  }],
  matchedVideos: [{
    videoId: String,
    segmentId: String,
    score: Number,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  voiceoverId: {
    type: Schema.Types.ObjectId,
    ref: 'Voiceover',
    default: null
  },
  voiceoverScript: {
    type: String
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
  jobId: {
    type: String
  },
  batchJobName: {
    type: String
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
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