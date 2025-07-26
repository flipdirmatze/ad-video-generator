'use client'

import React, { useState, useRef, useEffect } from 'react';
import { Range, getTrackBackground } from 'react-range';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface VideoTrimmerModalProps {
  videoFile: File;
  isOpen: boolean;
  onClose: () => void;
  onTrim: (startTime: number, endTime: number) => void;
}

const VideoTrimmerModal: React.FC<VideoTrimmerModalProps> = ({ 
  videoFile,
  isOpen, 
  onClose,
  onTrim
}) => {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [values, setValues] = useState<number[]>([0, 10]); // Initial trim range
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.load();
    }
  }, [isOpen]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      // Set initial trim range (e.g., first 6 seconds or full length if shorter)
      setValues([0, Math.min(6, videoDuration)]); 
    }
  };
  
  const handleConfirmTrim = () => {
    onTrim(values[0], values[1]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl text-white shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Video zuschneiden</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <video
            ref={videoRef}
            src={videoSrc}
            onLoadedMetadata={handleLoadedMetadata}
            controls={false}
            className="w-full rounded"
          />
        </div>
        
        {duration > 0 && (
          <div className="p-4 bg-gray-900/50 rounded-lg">
            <p className="text-center text-sm mb-4">
              Gewählter Bereich: {values[0].toFixed(2)}s - {values[1].toFixed(2)}s
            </p>
            <Range
              step={0.1}
              min={0}
              max={duration}
              values={values}
              onChange={(newValues) => setValues(newValues)}
              renderTrack={({ props, children }) => (
                <div
                  {...props}
                  style={{
                    ...props.style,
                    height: '6px',
                    width: '100%',
                    background: getTrackBackground({
                      values,
                      colors: ['#555', '#3b82f6', '#555'],
                      min: 0,
                      max: duration,
                    }),
                  }}
                  className="rounded-full"
                >
                  {children}
                </div>
              )}
              renderThumb={({ props, isDragged }) => (
                <div
                  {...props}
                  style={{
                    ...props.style,
                    height: '16px',
                    width: '16px',
                    borderRadius: '999px',
                    backgroundColor: '#fff',
                    border: '2px solid #3b82f6',
                    boxShadow: '0px 2px 6px #AAA',
                  }}
                />
              )}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
          >
            Abbrechen
          </button>
          <button 
            onClick={handleConfirmTrim}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded"
          >
            Zuschneiden & Bestätigen
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoTrimmerModal; 