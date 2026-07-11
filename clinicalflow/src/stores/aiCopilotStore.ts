// AI Copilot history — persisted per patient (STEP 6)
const STORAGE_KEY = 'cf_ai_copilot_history';

export interface AICopilotSuggestion {
  id: string;
  patientId: string;
  visitId?: string;
  notes: string;           // input notes the doctor typed
  summary: string;
  diagnosis: string;
  treatment: string;
  icdCode: string;
  createdAt: string;
}

function load(): AICopilotSuggestion[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items: AICopilotSuggestion[]) {
  try {
    // Keep last 200 entries total
    const capped = items.slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch { /* localStorage write failed */ }
}

export function saveAISuggestion(suggestion: Omit<AICopilotSuggestion, 'id' | 'createdAt'>) {
  const items = load();
  items.push({
    ...suggestion,
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  });
  save(items);
}

export function getAIHistory(patientId: string): AICopilotSuggestion[] {
  return load().filter(s => s.patientId === patientId).reverse();
}
