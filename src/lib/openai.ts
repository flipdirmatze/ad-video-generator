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
  position: number; // Startzeit des Segments in Sekunden
}

/**
 * Erstellt eine Sequenz von Videoclips, die ein Skriptsegment füllen.
 * Verwendet GPT-4 für eine kontextbasierte, dynamische Szenenerstellung.
 *
 * @param segments Die exakt getimten Skript-Segmente.
 * @param videos Eine Liste der verfügbaren Videos mit Dauer, Tags und Namen.
 * @returns Ein Array von Szenen, wobei jede Szene eine Liste von Videoclips für ein Segment enthält.
 */
export async function createScenesForScript(
  segments: ScriptSegment[],
  videos: { id: string; name: string; tags: string[]; duration: number }[]
): Promise<{ segmentId: string; videoClips: { videoId: string; duration: number }[] }[]> {
  console.log('Starte Szenen-Erstellung mit GPT-4 Turbo...');

  // Bereite die Video- und Segment-Listen für den Prompt vor.
  const videoListString = videos
    .map(v => `- Video (ID: "${v.id}", Name: "${v.name}", Dauer: ${v.duration}s, Tags: [${v.tags.join(', ')}])`)
    .join('\n');
  
  const segmentListString = segments
    .map(s => `- Segment (ID: "${s.id}", Dauer: ${s.duration}s, Text: "${s.text}")`)
    .join('\n');

  const systemPrompt = `
Du bist ein professioneller Video-Editor. Deine Aufgabe ist es, für eine Reihe von gesprochenen Text-Segmenten eine visuell ansprechende und dynamische Video-Sequenz zu erstellen.

DEINE AUFGABE:
Du erhältst eine Liste von Text-Segmenten (mit ihrer exakten Dauer) und eine Bibliothek von verfügbaren Videoclips (ebenfalls mit ihrer Dauer).
Fülle die Dauer JEDES Text-Segments mit einem oder mehreren passenden Videoclips aus deiner Bibliothek.

REGELN:
1.  **FÜLLE DIE DAUER:** Die kombinierte Dauer der von dir ausgewählten Videoclips für ein Segment muss exakt der Dauer des Text-Segments entsprechen. Du musst eventuell Clips kürzen.
2.  **DYNAMISCHE SCHNITTE:** Sorge für visuelle Abwechslung. Wechsle das Video idealerweise alle 4-5 Sekunden. Längere Segmente MÜSSEN aus mehreren, kürzeren Clips bestehen.
3.  **KONTEXTUELLE PASSUNG:** Wähle Videos, die thematisch und visuell zum Text des Segments und zum Gesamtkontext des Skripts passen. Nutze Dateinamen und Tags als starke Hinweise.
4.  **WIEDERVERWENDUNG ERLAUBT:** Du kannst Videoclips mehrfach verwenden, wenn es thematisch sinnvoll ist.

OUTPUT-FORMAT:
Dein Output MUSS ein valides JSON-Objekt sein, das nur aus einem Array namens "scenes" besteht.
Jedes Objekt im "scenes"-Array repräsentiert ein Text-Segment und muss folgende Struktur haben:
{
  "segmentId": "die ID des Segments",
  "videoClips": [
    { "videoId": "die ID des ersten Videos", "duration": 4.5 },
    { "videoId": "die ID des zweiten Videos", "duration": 3.0 },
    // ... weitere Clips, bis die Segment-Dauer gefüllt ist
  ]
}
Stelle sicher, dass die Summe der "duration" in "videoClips" exakt der Dauer des zugehörigen "segmentId" entspricht.
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
          content: `Erstelle die Video-Szenen für die folgenden Segmente und Videos:

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

    console.log('OpenAI Szenen-Antwort erhalten:', content);
    const result = JSON.parse(content);
    return result.scenes || [];

  } catch (error) {
    console.error('Fehler bei der OpenAI Szenen-Erstellung:', error);
    throw new Error(`Fehler bei der Szenen-Erstellung: ${error instanceof Error ? error.message : String(error)}`);
  }
} 