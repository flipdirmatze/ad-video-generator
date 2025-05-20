import { ScriptSegment } from '@/lib/openai';

// Typ für ein Video mit Tags
export interface TaggedVideo {
  id: string;
  name: string;
  tags: string[];
  url: string;
  duration?: number;
  path?: string;
}

// Typ für ein Video-Match
export interface VideoMatch {
  segment: ScriptSegment;
  video: TaggedVideo;
  score: number;
  startTime?: number;
  endTime?: number;
  source?: 'auto' | 'manual'; // Ursprung des Matches: automatisch oder manuell zugeordnet
}

/**
 * Berechnet die Ähnlichkeit zwischen Keywords und Tags
 * @param keywords Array von Keywords
 * @param tags Array von Tags
 * @returns Ähnlichkeitswert zwischen 0 und 1
 */
export function calculateSimilarity(keywords: string[], tags: string[]): number {
  if (!keywords.length || !tags.length) {
    return 0;
  }

  // Alle Keywords und Tags in Kleinbuchstaben umwandeln
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const lowerTags = tags.map(t => t.toLowerCase());
  
  let matches = 0;
  const totalPossibleMatches = Math.max(lowerKeywords.length, 1);
  
  // Für jedes Keyword prüfen, ob es in den Tags vorkommt
  for (const keyword of lowerKeywords) {
    // Exakte Übereinstimmung
    if (lowerTags.includes(keyword)) {
      matches += 1;
      continue;
    }
    
    // Teilweise Übereinstimmung
    for (const tag of lowerTags) {
      if (tag.includes(keyword) || keyword.includes(tag)) {
        matches += 0.5;
        break;
      }
    }
  }
  
  // Normalisieren auf einen Wert zwischen 0 und 1
  return Math.min(matches / totalPossibleMatches, 1);
}

/**
 * Findet das beste passende Video für ein Skriptsegment
 * @param segment Skriptsegment
 * @param videos Array von Videos mit Tags
 * @returns Das beste passende Video oder null, wenn kein passendes Video gefunden wurde
 */
export function findBestMatchingVideo(
  segment: ScriptSegment,
  videos: TaggedVideo[]
): VideoMatch | null {
  if (!segment || !segment.keywords || !videos || !videos.length) {
    return null;
  }

  let bestMatch: VideoMatch | null = null;
  let highestScore = 0;

  for (const video of videos) {
    if (!video.tags || !video.tags.length) continue;
    
    const score = calculateSimilarity(segment.keywords, video.tags);
    
    if (score > highestScore) {
      highestScore = score;
      bestMatch = {
        segment,
        video,
        score,
        source: 'auto' // Markiere dies als automatische Zuordnung
      };
    }
  }

  // Nur zurückgeben, wenn der Score über einem Mindestwert liegt
  return highestScore > 0.1 ? bestMatch : null;
}

/**
 * Findet passende Videos für alle Skriptsegmente
 * @param segments Array von Skriptsegmenten
 * @param videos Array von Videos mit Tags
 * @returns Array von Video-Matches
 */
export function matchVideosToSegments(
  segments: ScriptSegment[],
  videos: TaggedVideo[]
): VideoMatch[] {
  const matches: VideoMatch[] = [];
  
  for (const segment of segments) {
    const match = findBestMatchingVideo(segment, videos);
    if (match) {
      matches.push(match);
    }
  }
  
  return matches;
} 