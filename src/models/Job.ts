import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  jobName: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['submitted', 'processing', 'completed', 'failed'],
    default: 'submitted'
  },
  segments: [{
    videoId: String,
    url: String,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  voiceoverUrl: String,
  outputFileName: {
    type: String,
    required: true
  },
  outputUrl: String,
  error: String,
  progress: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Aktualisiere updatedAt vor jedem Speichern
jobSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const JobModel = mongoose.models.Job || mongoose.model('Job', jobSchema);

export default JobModel; 