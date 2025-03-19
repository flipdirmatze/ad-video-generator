import OpenAI from 'openai';

// OpenAI-Client initialisieren
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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