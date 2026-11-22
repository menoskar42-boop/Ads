export interface StoryAudioMapping {
  storyId: number;
  audioFile: string;
}

export const storyAudioMappings: StoryAudioMapping[] = [
  { storyId: 1, audioFile: '/audio/stories/begin.mp3' },
  { storyId: 2, audioFile: '/audio/stories/adam.mp3' },
  { storyId: 3, audioFile: '/audio/stories/noah.mp3' },
  { storyId: 4, audioFile: '/audio/stories/ebrahiem.mp3' },
  { storyId: 5, audioFile: '/audio/stories/joseph.mp3' },
  { storyId: 6, audioFile: '/audio/stories/mousa.mp3' },
  { storyId: 7, audioFile: '/audio/stories/david.mp3' },
  { storyId: 8, audioFile: '/audio/stories/elia.mp3' },
  { storyId: 9, audioFile: '/audio/stories/john.mp3' },
  { storyId: 10, audioFile: '/audio/stories/jesus_birth.mp3' },
];

export function getStoryAudioFile(storyId: number): string | undefined {
  const mapping = storyAudioMappings.find(m => m.storyId === storyId);
  return mapping?.audioFile;
}
