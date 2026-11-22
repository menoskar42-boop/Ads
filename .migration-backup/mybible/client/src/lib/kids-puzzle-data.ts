export interface PuzzleImage {
  id: string;
  title: string;
  youtubeId: string;
}

export const puzzleImages: PuzzleImage[] = [
  { id: 'creation',    title: 'بداية الخليقة',       youtubeId: 'CP6zi8IfnKg' },
  { id: 'adam-eve',    title: 'آدم وحواء',            youtubeId: 'R2qW0MJlbEI' },
  { id: 'noah',        title: 'فلك نوح',              youtubeId: 's8YQNIJ0tOI' },
  { id: 'abraham',     title: 'إبراهيم أبو الآباء',   youtubeId: 'LBndqPUDD1Y' },
  { id: 'joseph',      title: 'يوسف البار',           youtubeId: 'SJh4Mzy9eWs' },
  { id: 'david',       title: 'داود وجليات',          youtubeId: 'V-7KjSTUos8' },
  { id: 'jonah',       title: 'يونان النبي',          youtubeId: 'cBc1JumiGo0' },
  { id: 'daniel',      title: 'دانيال والأسود',        youtubeId: 'j4n9NsUh_nw' },
  { id: 'daniel-fire', title: 'الفتية في النار',      youtubeId: 'PxoTqaXXOow' },
];

export function randomPuzzleImage(): PuzzleImage {
  return puzzleImages[Math.floor(Math.random() * puzzleImages.length)];
}
