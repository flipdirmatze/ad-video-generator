import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IUser } from './User';

// 1. Create an interface representing a document in MongoDB
export interface IVideo {
  id?: string; // Optional in der Interface-Definition, wird aber beim Speichern gesetzt
  userId: string; // Änderung: String statt mongoose.Types.ObjectId | IUser
  name: string;
  originalFilename: string;
  size: number;
  type: string;
  path: string;
  url?: string; // Optional, da wir die URL dynamisch generieren
  tags: string[];
  width?: number;
  height?: number;
  duration?: number;
  isPublic: boolean;
  status?: string; // 'draft', 'processing', 'complete'
  progress?: number; // 0-100 für Fortschrittsanzeige
  createdAt: Date;
  updatedAt: Date;
}

// 2. Create a Schema corresponding to the document interface
const VideoSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4() // Generiere automatisch eine UUID, wenn keine angegeben wird
  },
  userId: {
    type: String,
    required: true,
    index: true // Index für schnellere Abfragen
  },
  name: {
    type: String,
    required: true
  },
  originalFilename: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    default: 'video/mp4'
  },
  tags: {
    type: [String],
    default: []
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'processing', 'trimming', 'complete'], // 'trimming' als gültigen Status hinzugefügt
    default: 'complete'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  duration: {
    type: Number,
    default: 0
  },
  width: {
    type: Number,
    default: 1920
  },
  height: {
    type: Number,
    default: 1080
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

// Pre-save Hook hinzufügen, der sicherstellt, dass id immer gesetzt ist
VideoSchema.pre('save', function(next) {
  if (!this.id) {
    this.id = uuidv4();
  }
  next();
});

// 3. Create a Model
const Video = mongoose.models.Video || mongoose.model('Video', VideoSchema);

export default Video; 