export async function loadOrthodoxTabData(tab: string): Promise<unknown> {
  switch (tab) {
    case 'synaxarium': return import('./synaxarium-content');
    case 'agpeya': return import('./agpeya-content');
    case 'liturgy': return import('./liturgy-content');
    case 'deacon':
    case 'maps':
    case 'pope-qa': return import('./orthodox-data');
    case 'hymns': return import('./hymns-content');
    case 'katameros': {
      const [lectionary, katameros] = await Promise.all([
        import('./coptic-lectionary'),
        import('./katameros-content'),
      ]);
      return { ...lectionary, ...katameros };
    }
    case 'saints': {
      const [saints, orthodox] = await Promise.all([
        import('./saints-content'),
        import('./orthodox-data'),
      ]);
      return { ...saints, ...orthodox };
    }
    case 'creed':
    case 'history':
    case 'qa':
    case 'figures': return import('./creed-data');
    case 'books': return import('./orthodox-books-content');
    default: return null;
  }
}
