import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IUser } from './User';

// 1. Create an interface representing a document in MongoDB
export interface IVideo {
  id?: string; // Optional in der Interface-Definition, wird aber beim Speichern gesetzt
  userId: mongoose.Types.ObjectId | IUser;
  name: string;
  originalFilename: string;
  size: number;
  type: string;
  path: string;
  url: string;
  tags: string[];
  width?: number;
  height?: number;
  duration?: number;
  isPublic: boolean;
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
    required: true
  },
  name: {
    type: String,
    required: true
  },
  url: {
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