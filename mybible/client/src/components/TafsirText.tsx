import { useMemo } from 'react';

interface TafsirSegment {
  text: string;
  isVerse: boolean;
}

function cleanArtifacts(s: string): string {
  return s
    .replace(/\\'a1/g, '، ')
    .replace(/'a1/g, '، ')
    .replace(/\\u00a1/g, '، ');
}

function stripVerseHeader(text: string): string {
  return text.replace(/^الأيات?\s+[\d\s،,\-\\'a-z]+\s*\n/i, '');
}

const MIN_VERSE_LENGTH = 30;

function splitVerseLabels(text: string): TafsirSegment[] {
  const segments: TafsirSegment[] = [];
  const lines = text.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (li > 0) segments.push({ text: '\n', isVerse: false });

    const colonIdx = line.indexOf(':');
    const equalsIdx = line.indexOf('=');

    let sepIdx = -1;
    if (colonIdx > 0 && colonIdx < 60) {
      const beforeColon = line.substring(0, colonIdx).trim();
      if (beforeColon.length >= 3 && !/\d:\d/.test(line.substring(Math.max(0, colonIdx - 3), colonIdx + 2))) {
        sepIdx = colonIdx;
      }
    }
    if (sepIdx === -1 && equalsIdx > 0 && equalsIdx < 60) {
      const beforeEquals = line.substring(0, equalsIdx).trim();
      if (beforeEquals.length >= 3) {
        sepIdx = equalsIdx;
      }
    }

    if (sepIdx > 0) {
      const label = line.substring(0, sepIdx).trim();
      const rest = line.substring(sepIdx);
      if (label.length >= 3) {
        segments.push({ text: label, isVerse: true });
        segments.push({ text: rest, isVerse: false });
      } else {
        segments.push({ text: line, isVerse: false });
      }
    } else {
      segments.push({ text: line, isVerse: false });
    }
  }

  return segments;
}

function parseTafsirText(rawText: string): TafsirSegment[] {
  let text = cleanArtifacts(rawText);
  text = stripVerseHeader(text);

  const segments: TafsirSegment[] = [];

  const combinedPattern = /([""\u201C\u201D]{2}[\s\S]*?[""\u201C\u201D]{2}|"[^"]{10,}")/;
  const parts = text.split(combinedPattern);

  for (const part of parts) {
    if (!part) continue;

    const isDQ = /^[""\u201C\u201D]{2}[\s\S]*[""\u201C\u201D]{2}$/.test(part);
    const isSQ = /^"[^"]{10,}"$/.test(part);

    if (isDQ || isSQ) {
      const inner = part
        .replace(/^[""\u201C\u201D]+/, '')
        .replace(/[""\u201C\u201D]+$/, '')
        .trim();
      const isSingleLine = !inner.includes('\n');
      if (inner && inner.length >= MIN_VERSE_LENGTH && isSingleLine) {
        segments.push({ text: inner, isVerse: true });
      } else if (inner) {
        segments.push({ text: inner, isVerse: false });
      }
    } else {
      const subSegments = splitVerseLabels(part);
      segments.push(...subSegments);
    }
  }

  return segments;
}

interface TafsirTextProps {
  text: string;
}

export function TafsirText({ text }: TafsirTextProps) {
  const segments = useMemo(() => parseTafsirText(text), [text]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.isVerse ? (
          <span key={i} className="font-bold text-primary">{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
