import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IProject {
  _id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'draft' | 'processing' | 'complete' | 'failed';
  progress: number;
  outputUrl?: string;
  batchJobId?: string;
  batchJobName?: string;
  error?: string;
  segments: {
    videoId: string;
    url: string;
    startTime: number;
    duration: number;
    position: number;
  }[];
  voiceoverId?: string;
  voiceoverUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['draft', 'processing', 'complete', 'failed'],
    default: 'draft'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  outputUrl: String,
  batchJobId: String,
  batchJobName: String,
  error: String,
  segments: [{
    videoId: String,
    url: String,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  voiceoverId: String,
  voiceoverUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const ProjectModel = mongoose.models.Project || mongoose.model('Project', projectSchema);

export default ProjectModel; 