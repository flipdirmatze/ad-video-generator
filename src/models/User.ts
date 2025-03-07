import mongoose from 'mongoose';
import { Schema } from 'mongoose';

// 1. Create an interface representing a document in MongoDB
export interface IUser {
  name: string;
  email: string;
  password?: string; // Password is optional for OAuth users
  image?: string;
  emailVerified?: Date;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

// 2. Create a Schema corresponding to the document interface
const UserSchema = new Schema<IUser>(
  {
    name: { 
      type: String, 
      required: [true, 'Name is required'] 
    },
    email: { 
      type: String, 
      required: [true, 'Email is required'], 
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    },
    password: { 
      type: String, // Hashed password, not required for OAuth users
    },
    image: { 
      type: String 
    },
    emailVerified: { 
      type: Date 
    },
    role: { 
      type: String, 
      enum: ['user', 'admin'], 
      default: 'user' 
    }
  }, 
  { 
    timestamps: true 
  }
);

// Don't return the password when converting to JSON or Object
UserSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.password;
    return ret;
  }
});

// 3. Create a Model
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User; 