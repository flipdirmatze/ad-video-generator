declare module 'node-fetch' {
  export default function fetch(
    url: string | URL | Request,
    init?: RequestInit
  ): Promise<Response>;
  
  export const Headers: typeof globalThis.Headers;
  export const Request: typeof globalThis.Request;
  export const Response: typeof globalThis.Response;
} 