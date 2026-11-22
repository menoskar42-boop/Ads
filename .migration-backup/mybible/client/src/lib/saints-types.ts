// ── أنواع بيانات القديسين ──────────────────────────────────────────────────

export interface SaintSection {
  id: string;
  title: string;
  text: string;
}

export interface Saint {
  id: string;
  name: string;
  feastDay: string;
  category: string;
  icon: string;
  shortBio: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  sections: SaintSection[];
}
