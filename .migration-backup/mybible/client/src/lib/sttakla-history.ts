export const ST_TAKLA_ROUTE = '/orthodox/st-takla';

export const ST_TAKLA_SECTION_KEYS = new Set(['ritual', 'bible', 'calendar'] as const);

export type StTaklaSectionKey = 'ritual' | 'bible' | 'calendar';

export type StTaklaLocationState = {
  section: StTaklaSectionKey | null;
  browse: string | null;
  page: number;
  query: string;
};

export function parseStTaklaLocation(location: string): StTaklaLocationState {
  const queryString = location.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(queryString);
  const sectionValue = params.get('section');
  const pageValue = Number(params.get('page') || 1);

  return {
    section: sectionValue && ST_TAKLA_SECTION_KEYS.has(sectionValue as StTaklaSectionKey)
      ? sectionValue as StTaklaSectionKey
      : null,
    browse: params.get('browse')?.trim() || null,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    query: params.get('q')?.trim().slice(0, 80) || '',
  };
}

export function buildStTaklaUrl(state: {
  section: StTaklaSectionKey;
  browse: string;
  page: number;
  query: string;
}): string {
  const params = new URLSearchParams({
    section: state.section,
    browse: state.browse,
    page: String(Math.max(1, Math.floor(state.page))),
  });
  if (state.query) params.set('q', state.query);
  return `${ST_TAKLA_ROUTE}?${params.toString()}`;
}

type Navigate = (url: string, options?: { replace?: boolean }) => void;

/**
 * User navigation pushes by default. The caller can opt into replace only for
 * an automatic correction, such as normalizing a missing section or an
 * out-of-range page returned by the source service.
 */
export function navigateStTakla(
  navigate: Navigate,
  state: { section: StTaklaSectionKey; browse: string; page: number; query: string },
  options?: { replace?: boolean },
) {
  navigate(buildStTaklaUrl(state), options);
}