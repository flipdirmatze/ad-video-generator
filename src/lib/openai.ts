import OpenAI from 'openai';
import { VideoMatch } from '@/utils/tag-matcher';

// Initialisiere den OpenAI-Client mit dem API-Schlüssel
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Interface für ein Skriptsegment
export interface ScriptSegment {
  id?: string; // Optionale ID für die Identifizierung des Segments
  text: string;
  keywords: string[];
  duration: number;
}

/**
 * Analysiert ein Skript und findet die besten passenden Videos für jedes Segment.
 * Verwendet GPT-4 für ein kontextuelles Verständnis des gesamten Skripts in einem einzigen Aufruf.
 *
 * @param segments Die exakt getimten Skript-Segmente.
 * @param videos Eine Liste der verfügbaren Videos mit Tags und Namen.
 * @returns Ein Array von Video-Matches, die von der KI zugeordnet wurden.
 */
export async function findBestMatchesForScript(
  segments: ScriptSegment[],
  videos: { id: string; name: string; tags: string[] }[]
): Promise<{ segmentId: string; videoId: string }[]> {
  console.log('Starte optimiertes kontextuelles Video-Matching mit GPT-4 Turbo...');

  // Bereite die Video- und Segment-Listen für den Prompt vor.
  const videoListString = videos
    .map(v => `- Video (ID: "${v.id}", Name: "${v.name}", Tags: [${v.tags.join(', ')}])`)
    .join('\n');
  
  const segmentListString = segments
    .map(s => `- Segment (ID: "${s.id}", Text: "${s.text}")`)
    .join('\n');

  const systemPrompt = `
Du bist ein Experte für Videoproduktion. Deine Aufgabe ist es, ein Skript zu analysieren und die am besten passenden Videoclips zuzuordnen.
Du erhältst eine Liste von Skript-Segmenten und eine Bibliothek von verfügbaren Videoclips.

DEINE AUFGABE IN EINEM SCHRITT:
1.  **Analysiere den Gesamtkontext:** Verstehe das Thema und die Stimmung der gesamten Segment-Liste.
2.  **Ordne jedem Segment das beste Video zu:** Wähle für JEDES Segment aus der Segment-Liste den EINEN Videoclip aus der Video-Bibliothek, der thematisch und visuell am besten passt. Nutze dafür den Segment-Text, den Video-Namen und die Video-Tags. Triff eine intelligente, kontextbezogene Entscheidung. Ein Clip kann mehrfach verwendet werden.

Dein Output MUSS ein valides JSON-Objekt sein, das nur aus einem einzigen Array namens "matches" besteht.
Jedes Objekt im "matches"-Array muss die Struktur '{"segmentId": "ID des Segments", "videoId": "ID des Videos"}' haben.
Stelle sicher, dass du für JEDES Segment genau ein Objekt im "matches"-Array zurückgibst.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Führe die Zuordnung für die folgenden Segmente und Videos durch:

--- SKRIPT-SEGMENTE ---
${segmentListString}

--- VIDEO-BIBLIOTHEK ---
${videoListString}
`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('OpenAI hat keine gültige Antwort zurückgegeben.');
    }

    console.log('OpenAI Matching-Antwort erhalten:', content);
    const result = JSON.parse(content);
    return result.matches || [];

  } catch (error) {
    console.error('Fehler beim OpenAI Video-Matching:', error);
    throw new Error(`Fehler beim kontextuellen Video-Matching: ${error instanceof Error ? error.message : String(error)}`);
  }
} 