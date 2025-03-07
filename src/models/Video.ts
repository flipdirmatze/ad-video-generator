import mongoose, { Schema, model, models } from 'mongoose';
import { IUser } from './User';

// 1. Create an interface representing a document in MongoDB
export interface IVideo {
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
const videoSchema = new Schema<IVideo>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    originalFilename: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    path: { type: String, required: true },
    url: { type: String, required: true },
    tags: [{ type: String }],
    width: Number,
    height: Number,
    duration: Number,
    isPublic: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// 3. Create a Model
export const Video = models.Video || model<IVideo>('Video', videoSchema);

export default Video; 