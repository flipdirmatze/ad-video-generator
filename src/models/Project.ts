import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  segments: {
    type: [],
    default: []
  },
  voiceoverScript: {
    type: String
  },
  voiceoverUrl: {
    type: String
  },
  outputUrl: {
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
}, {
  timestamps: true
});

// Verwende einen existierenden Mongoose-Model oder erstelle einen neuen
const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

export default Project; 