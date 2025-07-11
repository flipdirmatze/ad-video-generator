import React, { useState } from 'react';

type FinalOptions = {
  resolution?: string;
  aspectRatio?: string;
  addWatermark?: boolean;
  watermarkText?: string;
  addSubtitles?: boolean;
  subtitleOptions?: {
    fontName: string;
    fontSize: number;
    position: string;
  };
  outputFormat?: string;
};

type FinalStepFormProps = {
  onSubmit: (options: FinalOptions) => void;
};

// Vordefinierte Schriftarten für Untertitel
const SUBTITLE_FONTS = [
  { id: 'Arial', name: 'Arial (Standard)' },
  { id: 'Helvetica', name: 'Helvetica' },
  { id: 'Verdana', name: 'Verdana' },
  { id: 'Georgia', name: 'Georgia' },
  { id: 'Courier', name: 'Courier' },
  { id: 'Times', name: 'Times' }
];

// Positionen für Untertitel - wird nicht mehr im UI verwendet, aber für Default-Wert behalten
const SUBTITLE_POSITIONS = [
  { id: 'bottom', name: 'Unten (Standard)' },
  { id: 'top', name: 'Oben' },
  { id: 'middle', name: 'Mitte' }
];

export default function FinalStepForm({ onSubmit }: FinalStepFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [options, setOptions] = useState<FinalOptions>({
    resolution: '720p',
    aspectRatio: '16:9',
    addWatermark: false,
    watermarkText: '',
    addSubtitles: false,
    subtitleOptions: {
      fontName: 'Arial',
      fontSize: 20,
      position: 'bottom'
    },
    outputFormat: 'mp4'
  });

  // Handler für Änderungen an den Untertitel-Optionen
  const handleSubtitleOptionChange = (key: 'fontName', value: string) => {
    setOptions(prev => ({
      ...prev,
      subtitleOptions: {
        ...prev.subtitleOptions!,
        fontName: value,
        fontSize: 20, // Beibehaltung des festen Wertes
        position: 'bottom' // Beibehaltung des festen Wertes
      }
    }));
  };

  // Funktion zum Absenden des Formulars
  const handleSubmit = () => {
    const finalOptions = {
      ...options,
      subtitleOptions: options.addSubtitles ? {
        fontName: options.subtitleOptions?.fontName || 'Arial',
        fontSize: 20,
        position: 'bottom'
      } : undefined
    };
    
    setIsSubmitting(true);
    onSubmit(finalOptions);
  };

  return (
    <div className="flex flex-col gap-3 mt-4">
      <h3 className="text-lg font-semibold">Zusätzliche Optionen</h3>
      
      <div className="flex items-center gap-x-3">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="addWatermark"
            checked={options.addWatermark}
            onChange={(e) => setOptions({ ...options, addWatermark: e.target.checked })}
            className="checkbox checkbox-sm"
          />
          <label htmlFor="addWatermark" className="ml-2 cursor-pointer">
            Wasserzeichen hinzufügen
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="addSubtitles"
            checked={options.addSubtitles}
            onChange={(e) => setOptions({ ...options, addSubtitles: e.target.checked })}
            className="checkbox checkbox-sm"
          />
          <label htmlFor="addSubtitles" className="ml-2 cursor-pointer">
            Untertitel hinzufügen
          </label>
        </div>
      </div>
      
      {options.addWatermark && (
        <div className="mt-2">
          <label htmlFor="watermarkText" className="block text-sm font-medium">
            Wasserzeichen-Text
          </label>
          <input
            type="text"
            id="watermarkText"
            value={options.watermarkText}
            onChange={(e) => setOptions({ ...options, watermarkText: e.target.value })}
            className="mt-1 p-2 w-full rounded-md bg-gray-700 border-gray-600"
            placeholder="© Meine Firma 2023"
          />
        </div>
      )}
      
      {options.addSubtitles && (
        <div className="mt-2 p-3 bg-gray-800 rounded-md">
          <p className="text-sm text-white/70 mb-3">
            Die Untertitel werden automatisch aus dem Voiceover-Text generiert.
            Wählen Sie hier die gewünschte Schriftart für die Untertitel aus.
          </p>
          
          <div className="grid grid-cols-1 gap-3">
            {/* Schriftart */}
            <div>
              <label htmlFor="subtitleFont" className="block text-sm font-medium">
                Schriftart
              </label>
              <select
                id="subtitleFont"
                value={options.subtitleOptions?.fontName}
                onChange={(e) => handleSubtitleOptionChange('fontName', e.target.value)}
                className="mt-1 p-2 w-full rounded-md bg-gray-700 border-gray-600"
              >
                {SUBTITLE_FONTS.map(font => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="btn btn-primary w-full"
        >
          {isSubmitting ? 'Wird verarbeitet...' : 'Video generieren'}
        </button>
      </div>
    </div>
  );
} 