"use client";

import { useState } from 'react';
import Link from 'next/link';

export default function TestConcatPage() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the two latest videos for testing
  const video1Path = '/uploads/4cc60d26-a01e-45a5-bce0-3767da298981-1.mp4';
  const video2Path = '/uploads/b6c5c9eb-dfc0-4d26-a0e3-f03d25796b25-2.mp4';

  const handleConcatenate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/concat-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videos: [
            { path: video1Path },
            { path: video2Path },
          ]
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to concatenate videos');
      }
      
      const data = await response.json();
      setResult(data.outputPath);
    } catch (err) {
      console.error('Error concatenating videos:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Test Video Concatenation</h1>
      
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-3">Video 1</h2>
          <video 
            src={video1Path} 
            controls 
            className="w-full max-w-lg border border-gray-300 rounded-lg"
          />
          <p className="mt-2 text-sm text-gray-600">{video1Path}</p>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-3">Video 2</h2>
          <video 
            src={video2Path} 
            controls 
            className="w-full max-w-lg border border-gray-300 rounded-lg"
          />
          <p className="mt-2 text-sm text-gray-600">{video2Path}</p>
        </div>
      </div>
      
      <div className="mb-8">
        <button
          onClick={handleConcatenate}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg disabled:bg-blue-400"
        >
          {loading ? 'Concatenating...' : 'Concatenate Videos'}
        </button>
      </div>
      
      {error && (
        <div className="p-4 mb-6 bg-red-100 text-red-700 rounded-lg">
          <h3 className="font-semibold">Error:</h3>
          <p>{error}</p>
        </div>
      )}
      
      {result && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Concatenated Result</h2>
          <video 
            src={result} 
            controls 
            className="w-full max-w-2xl border border-gray-300 rounded-lg"
          />
          <p className="mt-2 text-sm text-gray-600">{result}</p>
        </div>
      )}

      <div className="mt-8">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
} 