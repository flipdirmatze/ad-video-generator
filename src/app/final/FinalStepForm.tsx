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
    primaryColor: string;
    backgroundColor: string;
    borderStyle: number;
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

// Border-Stile für Untertitel
const BORDER_STYLES = [
  { id: 1, name: 'Umriss + Schatten' },
  { id: 3, name: 'Nur Umriss' },
  { id: 4, name: 'Abgerundeter Hintergrund' }
];

// Positionen für Untertitel
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
      fontSize: 24,
      primaryColor: '#FFFFFF',
      backgroundColor: '#80000000',
      borderStyle: 4,
      position: 'bottom'
    },
    outputFormat: 'mp4'
  });

  // Handler für Änderungen an den Untertitel-Optionen
  const handleSubtitleOptionChange = (key: string, value: string | number) => {
    setOptions({
      ...options,
      subtitleOptions: {
        ...options.subtitleOptions,
        [key]: value
      }
    });
  };

  // Funktion zum Absenden des Formulars
  const handleSubmit = () => {
    setIsSubmitting(true);
    onSubmit(options);
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
            Passen Sie hier das Aussehen der Untertitel an:
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            
            {/* Schriftgröße */}
            <div>
              <label htmlFor="subtitleSize" className="block text-sm font-medium">
                Schriftgröße
              </label>
              <select
                id="subtitleSize"
                value={options.subtitleOptions?.fontSize}
                onChange={(e) => handleSubtitleOptionChange('fontSize', parseInt(e.target.value))}
                className="mt-1 p-2 w-full rounded-md bg-gray-700 border-gray-600"
              >
                {[18, 20, 22, 24, 26, 28, 30, 32, 36, 40].map(size => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </div>
            
            {/* Textfarbe */}
            <div>
              <label htmlFor="subtitleColor" className="block text-sm font-medium">
                Textfarbe
              </label>
              <div className="flex items-center mt-1">
                <input
                  type="color"
                  id="subtitleColor"
                  value={options.subtitleOptions?.primaryColor}
                  onChange={(e) => handleSubtitleOptionChange('primaryColor', e.target.value)}
                  className="h-9 w-9 rounded border border-gray-600"
                />
                <input
                  type="text"
                  value={options.subtitleOptions?.primaryColor}
                  onChange={(e) => handleSubtitleOptionChange('primaryColor', e.target.value)}
                  className="ml-2 p-2 flex-grow rounded-md bg-gray-700 border-gray-600"
                />
              </div>
            </div>
            
            {/* Hintergrundfarbe */}
            <div>
              <label htmlFor="subtitleBgColor" className="block text-sm font-medium">
                Hintergrundfarbe
              </label>
              <div className="flex items-center mt-1">
                <input
                  type="color"
                  id="subtitleBgColor"
                  value={options.subtitleOptions?.backgroundColor.substring(0, 7)}
                  onChange={(e) => handleSubtitleOptionChange('backgroundColor', e.target.value + '80')}
                  className="h-9 w-9 rounded border border-gray-600"
                />
                <input
                  type="text"
                  value={options.subtitleOptions?.backgroundColor}
                  onChange={(e) => handleSubtitleOptionChange('backgroundColor', e.target.value)}
                  className="ml-2 p-2 flex-grow rounded-md bg-gray-700 border-gray-600"
                />
                <div className="text-xs text-white/50 ml-2">(80 = 50% Transparenz)</div>
              </div>
            </div>
            
            {/* Randstil */}
            <div>
              <label htmlFor="subtitleBorder" className="block text-sm font-medium">
                Randstil
              </label>
              <select
                id="subtitleBorder"
                value={options.subtitleOptions?.borderStyle}
                onChange={(e) => handleSubtitleOptionChange('borderStyle', parseInt(e.target.value))}
                className="mt-1 p-2 w-full rounded-md bg-gray-700 border-gray-600"
              >
                {BORDER_STYLES.map(style => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Position */}
            <div>
              <label htmlFor="subtitlePosition" className="block text-sm font-medium">
                Position
              </label>
              <select
                id="subtitlePosition"
                value={options.subtitleOptions?.position}
                onChange={(e) => handleSubtitleOptionChange('position', e.target.value)}
                className="mt-1 p-2 w-full rounded-md bg-gray-700 border-gray-600"
              >
                {SUBTITLE_POSITIONS.map(position => (
                  <option key={position.id} value={position.id}>
                    {position.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-gray-900 rounded border border-gray-700">
            <div className="text-center text-sm">Vorschau</div>
            <div 
              className="mt-2 p-2 rounded text-center"
              style={{
                fontFamily: options.subtitleOptions?.fontName,
                fontSize: `${options.subtitleOptions?.fontSize}px`,
                color: options.subtitleOptions?.primaryColor,
                backgroundColor: options.subtitleOptions?.backgroundColor.substring(0, 7) + '80',
                borderRadius: options.subtitleOptions?.borderStyle === 4 ? '4px' : '0',
                borderWidth: options.subtitleOptions?.borderStyle === 3 ? '1px' : '0',
                borderColor: options.subtitleOptions?.primaryColor,
                textShadow: options.subtitleOptions?.borderStyle === 1 ? '1px 1px 1px #000' : 'none'
              }}
            >
              Beispieltext für Untertitel
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