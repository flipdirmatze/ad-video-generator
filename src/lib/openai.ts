import OpenAI from 'openai';

// Initialisiere den OpenAI-Client mit dem API-Schlüssel
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Interface für ein Skriptsegment
export interface ScriptSegment {
  id: string;
  text: string;
  keywords: string[];
  duration: number;
  position: number;
}

/**
 * Erstellt eine visuelle Playlist für Skript-Segmente.
 * Verwendet GPT-4, um jedem Segment eine Sequenz von passenden Video-IDs zuzuordnen.
 *
 * @param segments Die exakt getimten Skript-Segmente.
 * @param videos Eine Liste der verfügbaren Videos mit Tags und Namen.
 * @returns Ein Array, das jedem Segment eine Liste von Video-IDs zuordnet.
 */
export async function createVisualPlaylistForScript(
  segments: ScriptSegment[],
  videos: { id: string; name: string; tags: string[] }[]
): Promise<{ segmentId: string; videoIds: string[] }[]> {
  console.log('Starte optimierte Playlist-Erstellung mit GPT-4 Turbo...');

  const videoListString = videos
    .map(v => `- Video (ID: "${v.id}", Name: "${v.name}", Tags: [${v.tags.join(', ')}])`)
    .join('\n');
  
  const segmentListString = segments
    .map(s => `- Segment (ID: "${s.id}", Dauer: ${s.duration}s, Text: "${s.text}")`)
    .join('\n');

  const systemPrompt = `
Du bist ein professioneller Video-Editor. Deine Aufgabe ist es, für eine Reihe von gesprochenen Text-Segmenten eine visuelle Playlist zu erstellen.

DEINE AUFGABE:
Du erhältst eine Liste von Text-Segmenten und eine Bibliothek von verfügbaren Videoclips.
Erstelle für JEDES Segment eine Playlist von Video-IDs, die visuell zum Text passen.

REGELN:
1.  **DYNAMISCHE SCHNITTE:** Wenn ein Segment länger als 5 Sekunden ist, wähle MEHRERE thematisch passende Videos für eine dynamische Sequenz aus, um die visuelle Abwechslung zu erhöhen.
2.  **KURZE SEGMENTE:** Wenn ein Segment 5 Sekunden oder kürzer ist, wähle EIN passendes Video.
3.  **KONTEXTUELLE PASSUNG:** Wähle Videos, die zur Stimmung und zum Thema des Segments passen. Nutze Dateinamen und Tags als starke Hinweise.
4.  **WIEDERVERWENDUNG ERLAUBT:** Du kannst Videos mehrfach verwenden.

OUTPUT-FORMAT:
Dein Output MUSS ein valides JSON-Objekt sein, das nur aus einem Array namens "playlist" besteht.
Jedes Objekt im "playlist"-Array muss folgende Struktur haben:
{
  "segmentId": "die ID des Segments",
  "videoIds": ["id_des_ersten_videos", "id_des_zweiten_videos", ...]
}
Stelle sicher, dass du für JEDES Segment genau ein Objekt im "playlist"-Array zurückgibst.
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
          content: `Erstelle die visuelle Playlist für die folgenden Segmente und Videos:

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

    console.log('OpenAI Playlist-Antwort erhalten:', content);
    const result = JSON.parse(content);
    return result.playlist || [];

  } catch (error) {
    console.error('Fehler bei der OpenAI Playlist-Erstellung:', error);
    throw new Error(`Fehler bei der Playlist-Erstellung: ${error instanceof Error ? error.message : String(error)}`);
  }
} 