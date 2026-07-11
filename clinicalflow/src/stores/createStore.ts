// Generic reactive store with pub/sub + optional localStorage persistence
//
// persistKey  → localStorage key to load from AND save to on every mutation
// saveOnly    → skip loading from storage (use initialData as-is), but still save on mutations
//               Used by stores that do their own load/merge logic before calling createStore
//
export function createStore<T>(initialData: T[], persistKey?: string, saveOnly = false) {
  const tryLoad = (): T[] | null => {
    if (!persistKey || saveOnly) return null;
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) return JSON.parse(raw) as T[];
    } catch { /* storage unavailable */ }
    return null;
  };

  const stored = tryLoad();
  let items: T[] = stored ?? [...initialData];

  const save = () => {
    if (!persistKey) return;
    try { localStorage.setItem(persistKey, JSON.stringify(items)); } catch { /* graceful */ }
  };

  // Seed storage on very first run (localStorage was empty)
  if (persistKey && !stored && initialData.length > 0) save();

  let listeners: (() => void)[] = [];
  const notify = () => listeners.forEach(cb => cb());

  return {
    getAll: () => items,
    get:    (predicate: (item: T) => boolean) => items.find(predicate),
    filter: (predicate: (item: T) => boolean) => items.filter(predicate),
    add: (item: T) => {
      items = [item, ...items];
      save();
      notify();
      return item;
    },
    update: (predicate: (item: T) => boolean, updater: Partial<T> | ((item: T) => T)) => {
      items = items.map(i =>
        predicate(i)
          ? typeof updater === 'function'
            ? (updater as (item: T) => T)(i)
            : { ...i, ...updater }
          : i
      );
      save();
      notify();
    },
    remove: (predicate: (item: T) => boolean) => {
      items = items.filter(i => !predicate(i));
      save();
      notify();
    },
    set: (newItems: T[]) => {
      items = newItems;
      save();
      notify();
    },
    subscribe: (callback: () => void) => {
      listeners.push(callback);
      return () => {
        listeners = listeners.filter(cb => cb !== callback);
      };
    },
  };
}
