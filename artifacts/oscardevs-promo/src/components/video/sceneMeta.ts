export interface SceneDetails { title: string; filePath: string; }
export const SCENE_DETAILS: Record<string, SceneDetails> = {
  shot01: { title: 'افتتاحية', filePath: 'src/components/video/scenes/Shot01.tsx' },
  shot02: { title: 'الفكرة والبناء', filePath: 'src/components/video/scenes/Shot02.tsx' },
  shot03: { title: 'التجربة الرقمية', filePath: 'src/components/video/scenes/Shot03.tsx' },
  shot04: { title: 'التفاصيل', filePath: 'src/components/video/scenes/Shot04.tsx' },
  shot05: { title: 'الحضور', filePath: 'src/components/video/scenes/Shot05.tsx' },
  shot06: { title: 'الختام', filePath: 'src/components/video/scenes/Shot06.tsx' },
};
