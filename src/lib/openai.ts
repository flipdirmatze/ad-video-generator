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

// Interface für die Antwort der Skriptanalyse
interface ScriptAnalysisResponse {
  segments: ScriptSegment[];
}

/**
 * Analysiert ein Skript und teilt es in logische Abschnitte auf
 * @param script Das zu analysierende Skript
 * @returns Ein Array von Skriptsegmenten mit Text, Keywords und geschätzter Dauer
 */
export async function analyzeScript(script: string): Promise<ScriptSegment[]> {
  try {
    console.log('Analysiere Skript mit OpenAI API...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Du bist ein Assistent, der Videoskripte analysiert und in kurze Abschnitte unterteilt. 
          Deine Aufgabe ist es, das Skript in kleine Segmente von etwa 3-4 Sekunden Sprechzeit zu unterteilen.
          Jedes Segment sollte einen kurzen, eigenständigen Satz oder Teilsatz darstellen.
          Für jedes Segment sollst du relevante Keywords extrahieren, die für die Videosuche nützlich sind.
          Die maximale Dauer eines Segments sollte 5 Sekunden nicht überschreiten.`
        },
        {
          role: "user",
          content: `Analysiere das folgende Skript und teile es in viele kurze Abschnitte von etwa 3-4 Sekunden auf. 
          Wichtig: Bei längeren Skripten müssen die Segmente kurz sein, damit der Zuschauer genügend visuelle Abwechslung erhält.
          
          Für jeden Abschnitt gib folgende Informationen zurück:
          1. Den Text des Abschnitts (nur kurze Sätze oder Teilsätze, max. 10-15 Wörter)
          2. 3-5 Schlüsselwörter, die den visuellen Inhalt beschreiben (was im Video zu sehen sein sollte)
          3. Eine geschätzte Sprechzeit in Sekunden (durchschnittlich 3 Wörter pro Sekunde)
          
          Regeln für die Segmentierung:
          - Die Segmente sollten zwischen 2 und 5 Sekunden lang sein
          - Längere Sätze sollten in mehrere Segmente aufgeteilt werden
          - Bei einem 30-Sekunden-Skript sollten mindestens 7-10 Segmente entstehen
          - Kein Segment sollte mehr als 15 Wörter enthalten
          
          Formatiere die Antwort als JSON-Array mit Objekten, die die Felder "text", "keywords" und "duration" enthalten.
          
          Skript:
          ${script}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parsen der JSON-Antwort
    const content = response.choices[0].message.content || "{}";
    console.log('OpenAI Antwort erhalten:', content);
    
    const result = JSON.parse(content) as ScriptAnalysisResponse;
    return result.segments || [];
  } catch (error) {
    console.error('Fehler bei der OpenAI API:', error);
    throw new Error(`Fehler bei der Skriptanalyse: ${error instanceof Error ? error.message : String(error)}`);
  }
}


/**
 * Generiert Tags für ein Video basierend auf seinem Inhalt
 * @param videoDescription Eine Beschreibung des Videoinhalts
 * @returns Ein Array von Tags
 */
export async function generateVideoTags(videoDescription: string): Promise<string[]> {
  try {
    console.log('Generiere Tags für Video mit OpenAI API...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Du bist ein Assistent, der Videos analysiert und relevante Tags generiert.
          Deine Aufgabe ist es, basierend auf der Beschreibung eines Videos, relevante Tags zu generieren,
          die den Inhalt des Videos gut beschreiben und für ein Matching-System nützlich sind.`
        },
        {
          role: "user",
          content: `Generiere 5-10 relevante Tags für das folgende Video.
          Die Tags sollten den visuellen Inhalt des Videos beschreiben und für ein Matching-System nützlich sein.
          Gib nur die Tags zurück, ohne zusätzlichen Text, als JSON-Array von Strings.
          
          Videobeschreibung:
          ${videoDescription}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parsen der JSON-Antwort
    const content = response.choices[0].message.content || "{}";
    console.log('OpenAI Antwort erhalten:', content);
    
    const result = JSON.parse(content);
    return result.tags || [];
  } catch (error) {
    console.error('Fehler bei der OpenAI API:', error);
    throw new Error(`Fehler bei der Tag-Generierung: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generiert für gegebene Skript-Segmente passende visuelle Beschreibungen.
 *
 * @param segments Die Skript-Segmente mit exaktem Text und Dauer.
 * @returns Die Segmente, angereichert mit visuellen Beschreibungsvorschlägen.
 */
export async function generateVisualsForSegments(segments: ScriptSegment[]): Promise<ScriptSegment[]> {
  console.log('Generiere visuelle Beschreibungen für Segmente mit GPT-4...');

  const scriptForPrompt = segments
    .map((s, i) => `Segment ${i + 1} (Dauer: ${s.duration}s): "${s.text}"`)
    .join('\n');

  const systemPrompt = `
Du bist ein kreativer Video-Regisseur. Deine Aufgabe ist es, für ein gegebenes Werbeskript visuelle Ideen zu entwickeln.
Du erhältst eine Liste von Text-Segmenten mit ihrer exakten Dauer.

Deine Aufgabe:
Beschreibe für JEDES Segment eine passende visuelle Szene. Die Beschreibung sollte als Anweisung für ein Video-Matching-System dienen.
Konzentriere dich auf die Stimmung, die Handlung und die Objekte in der Szene.

Beispiel:
- Input-Segment: "Dann verpasst du jede Woche echte Aktienchancen!"
- Output-Beschreibung: "Ein dynamischer Börsenchart, der nach oben zeigt. Eine Person, die erfreut auf einen Computer-Monitor blickt."

Dein Output MUSS ein valides JSON-Objekt sein, das nur aus einem Array namens "visuals" besteht.
Jedes Objekt im "visuals"-Array muss folgende Struktur haben:
{
  "segmentId": "die ID des Segments (z.B. 'seg_1')",
  "visualDescription": "Deine kreative Beschreibung der visuellen Szene."
}
Stelle sicher, dass du für JEDES Segment genau ein Objekt im "visuals"-Array zurückgibst.
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
          content: `Generiere die visuellen Beschreibungen für die folgenden Skript-Segmente:

${scriptForPrompt}
`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('OpenAI hat keine gültige Antwort zurückgegeben.');
    }

    const result = JSON.parse(content);
    const visuals: { segmentId: string; visualDescription: string }[] = result.visuals || [];

    // Reichere die ursprünglichen Segmente mit den visuellen Beschreibungen an.
    const enrichedSegments = segments.map(segment => {
      const visual = visuals.find(v => v.segmentId === segment.id);
      return {
        ...segment,
        // Die visuelle Beschreibung wird temporär im keywords-Feld gespeichert.
        keywords: visual ? [visual.visualDescription] : [],
      };
    });

    return enrichedSegments;

  } catch (error) {
    console.error('Fehler bei der Generierung der visuellen Beschreibungen:', error);
    throw new Error(`Fehler bei der visuellen Analyse: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analysiert ein Skript und findet die besten passenden Videos für jedes Segment.
 * Verwendet GPT-4 für ein kontextuelles Verständnis des gesamten Skripts.
 * 
 * @param script Das vollständige Werbeskript.
 * @param videos Eine Liste der verfügbaren Videos mit Tags und Namen.
 * @returns Ein Array von Video-Matches, die von der KI zugeordnet wurden.
 */
export async function findBestMatchesForScript(
  script: string,
  videos: { id: string; name: string; tags: string[] }[]
): Promise<{ segmentId: string; videoId: string; }[]> {
  console.log('Starte kontextuelles Video-Matching mit GPT-4 Turbo...');

  // Bereite die Videoliste für den Prompt vor.
  console.log('[MATCHING-LOG] Bereite Videoliste für Prompt vor...');
  const videoListString = videos
    .map(v => `id: "${v.id}", name: "${v.name}", tags: [${v.tags.join(', ')}]`)
    .join('\n');
  console.log(`[MATCHING-LOG] Videoliste erstellt, Länge: ${videoListString.length} Zeichen.`);

  const systemPrompt = `
Du bist ein Experte für Videoproduktion und deine Aufgabe ist es, ein Werbeskript zu analysieren und die am besten passenden Videoclips zuzuordnen.
Du erhältst ein Skript, das in Segmente unterteilt ist, und eine Liste von verfügbaren Videoclips.

Dein Vorgehen:
1.  **Gesamtkontext verstehen:** Lies das gesamte Skript, um das zentrale Thema, die Stimmung (z.B. fröhlich, seriös, dringend) und die gewünschte visuelle Abfolge zu verstehen.
2.  **Segmentweise Zuordnung:** Gehe das Skript Segment für Segment durch.
3.  **Bester Clip pro Segment:** Wähle für JEDES Segment den EINEN Videoclip aus der Liste, der thematisch und visuell am besten passt. Berücksichtige dabei den Gesamtkontext. Ein Clip kann mehrfach verwendet werden, wenn es sinnvoll ist.
4.  **Logische Schlussfolgerung:** Verlasse dich nicht nur auf exakte Keyword-Übereinstimmungen. Nutze die Dateinamen und Tags als Hinweise, aber triff eine intelligente Entscheidung basierend auf dem, was visuell am besten zur Aussage des Segments und zur Stimmung des gesamten Videos passt.

Dein Output MUSS ein valides JSON-Objekt sein, das nur aus einem einzigen Array namens "matches" besteht.
Jedes Objekt im "matches"-Array repräsentiert ein Skriptsegment und muss folgende Struktur haben:
{
  "segmentId": "die ID des Skriptsegments (z.B. 'seg_1')",
  "videoId": "die ID des zugeordneten Videoclips (z.B. 'vid_abc123')"
}
Stelle sicher, dass du für JEDES Segment aus dem Input genau ein Objekt im "matches"-Array zurückgibst.
`;

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Hier ist das Skript und die Liste der verfügbaren Videos. Führe die Zuordnung durch.

--- SCRIPT ---
${script}

--- VERFÜGBARE VIDEOS ---
${videoListString}
`,
      },
    ];

    const totalPromptLength = messages.reduce((acc, msg) => acc + (typeof msg.content === 'string' ? msg.content.length : 0), 0);
    console.log(`[MATCHING-LOG] Gesamt-Prompt-Länge: ${totalPromptLength} Zeichen. Sende Anfrage an OpenAI...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // Einsatz des leistungsstärkeren Modells
      messages: messages,
      response_format: { type: "json_object" },
    });

    console.log('[MATCHING-LOG] Antwort von OpenAI erfolgreich erhalten.');

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('OpenAI hat keine gültige Antwort zurückgegeben.');
    }

    console.log('OpenAI Matching-Antwort erhalten:', content);
    const result = JSON.parse(content);

    // Verarbeite das Ergebnis, um es in das VideoMatch-Format zu bringen
    // Diese Logik muss im aufrufenden Service implementiert werden,
    // da wir hier keinen Zugriff auf die vollständigen Video- oder Segment-Objekte haben.
    return result.matches || [];

  } catch (error) {
    console.error('Fehler bei der OpenAI API für das Video-Matching:', error);
    throw new Error(`Fehler beim kontextuellen Video-Matching: ${error instanceof Error ? error.message : String(error)}`);
  }
} 