// Platzhalter für den Prisma-Client
// Diese Datei wird während des Vercel-Deployments verwendet, um Baufehler zu vermeiden
// Später wird sie durch eine vollständige Prisma-Konfiguration ersetzt

// Prisma Client Interface
interface Project {
  id: string;
  userId: string;
  status: string;
  segments: any[];
  voiceoverScript?: string;
  voiceoverUrl?: string;
}

interface Video {
  id: string;
  userId: string;
  url: string;
  title: string;
  duration: number;
  width: number;
  height: number;
}

// Mock Prisma Client
const prisma = {
  project: {
    create: async ({ data }: { data: any }): Promise<Project> => {
      console.log('Mock Project creation:', data);
      return {
        id: `project-${Date.now()}`,
        userId: data.userId,
        status: data.status,
        segments: data.segments || [],
        voiceoverScript: data.voiceoverScript,
        voiceoverUrl: data.voiceoverUrl
      };
    },
    findMany: async ({ where }: { where: any }): Promise<Project[]> => {
      console.log('Mock Project query:', where);
      return [];
    },
    findUnique: async ({ where }: { where: any }): Promise<Project | null> => {
      console.log('Mock Project lookup:', where);
      return null;
    },
    update: async ({ where, data }: { where: any, data: any }): Promise<Project> => {
      console.log('Mock Project update:', where, data);
      return {
        id: where.id || 'mock-id',
        userId: 'mock-user',
        status: data.status || 'COMPLETED',
        segments: [],
      };
    }
  },
  video: {
    create: async ({ data }: { data: any }): Promise<Video> => {
      console.log('Mock Video creation:', data);
      return {
        id: `video-${Date.now()}`,
        userId: data.userId,
        url: data.url,
        title: data.title || 'Untitled',
        duration: data.duration || 0,
        width: data.width || 1920,
        height: data.height || 1080
      };
    },
    findMany: async ({ where }: { where: any }): Promise<Video[]> => {
      console.log('Mock Video query:', where);
      return [];
    }
  }
};

export default prisma; 