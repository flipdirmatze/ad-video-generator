import { IWordTimestamp } from '@/models/Voiceover';
import { ScriptSegment } from '@/lib/openai';

/**
 * Gruppiert Wörter intelligent zu Sätzen basierend auf Satzzeichen.
 * @param words Array von IWordTimestamp-Objekten.
 * @returns Ein Array von Wort-Arrays, wobei jedes innere Array einen Satz darstellt.
 */
function groupWordsIntoSentences(words: IWordTimestamp[]): IWordTimestamp[][] {
  const sentences: IWordTimestamp[][] = [];
  if (!words.length) {
    return sentences;
  }

  let currentSentence: IWordTimestamp[] = [];
  words.forEach((word, index) => {
    currentSentence.push(word);
    // Beendet einen Satz bei einem Punkt, Fragezeichen oder Ausrufezeichen.
    if (/[.?!]$/.test(word.word) || index === words.length - 1) {
      sentences.push(currentSentence);
      currentSentence = [];
    }
  });

  return sentences;
}

/**
 * Erstellt präzise getimte Skript-Segmente aus Wort-Zeitstempeln.
 * @param timestamps Ein Array von Wort-Zeitstempeln von ElevenLabs.
 * @returns Ein Array von ScriptSegment-Objekten mit exakter Dauer.
 */
export function createSegmentsFromTimestamps(timestamps: IWordTimestamp[]): ScriptSegment[] {
  if (!timestamps || timestamps.length === 0) {
    return [];
  }

  const sentences = groupWordsIntoSentences(timestamps);

  const segments: ScriptSegment[] = sentences.map((sentenceWords, index) => {
    const text = sentenceWords.map(w => w.word).join(' ');
    const startTime = sentenceWords[0].startTime;
    const endTime = sentenceWords[sentenceWords.length - 1].endTime;
    const duration = parseFloat((endTime - startTime).toFixed(2));

    return {
      id: `seg_${index + 1}`,
      text,
      duration,
      keywords: [], // Keywords werden in einem späteren Schritt von der KI hinzugefügt.
      position: startTime, // Füge die Startzeit als Position hinzu
    };
  });

  return segments;
} 