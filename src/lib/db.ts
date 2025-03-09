/**
 * Datenbankfunktionen mit Mongoose anstelle von Prisma
 */

import { v4 as uuidv4 } from 'uuid';
import dbConnect from './mongoose';
import Video from '@/models/Video';
import Project from '@/models/Project';

/**
 * Ersatz für Prisma-Datenbankfunktionen
 */
const db = {
  video: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async ({ data }: { data: any }) => {
      await dbConnect();
      const videoId = data.id || uuidv4();
      
      const video = new Video({
        id: videoId,
        ...data
      });
      
      await video.save();
      return video;
    },
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: async ({ where, orderBy }: { where: any, orderBy?: any }) => {
      await dbConnect();
      let query = Video.find(where);
      
      if (orderBy) {
        const sortField = Object.keys(orderBy)[0];
        const sortOrder = orderBy[sortField] === 'desc' ? -1 : 1;
        query = query.sort({ [sortField]: sortOrder });
      } else {
        query = query.sort({ createdAt: -1 });
      }
      
      return query;
    },
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: async ({ where }: { where: any }) => {
      await dbConnect();
      return Video.findOne(where);
    }
  },
  
  project: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async ({ data }: { data: any }) => {
      await dbConnect();
      const projectId = data.id || uuidv4();
      
      const project = new Project({
        id: projectId,
        ...data
      });
      
      await project.save();
      return project;
    },
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: async ({ where, orderBy }: { where: any, orderBy?: any }) => {
      await dbConnect();
      let query = Project.find(where);
      
      if (orderBy) {
        const sortField = Object.keys(orderBy)[0];
        const sortOrder = orderBy[sortField] === 'desc' ? -1 : 1;
        query = query.sort({ [sortField]: sortOrder });
      } else {
        query = query.sort({ createdAt: -1 });
      }
      
      return query;
    },
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: async ({ where }: { where: any }) => {
      await dbConnect();
      return Project.findOne(where);
    },
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: async ({ where, data }: { where: any, data: any }) => {
      await dbConnect();
      return Project.findOneAndUpdate(where, { $set: data }, { new: true });
    }
  }
};

export default db; 