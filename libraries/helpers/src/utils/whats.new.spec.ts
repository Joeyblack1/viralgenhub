import {
  CHANGELOG_URL,
  hasUnseenWhatsNew,
  isKnownWhatsNewId,
  latestWhatsNewId,
  unseenWhatsNew,
  WHATS_NEW,
  WHATS_NEW_ID_PATTERN,
  WhatsNewEntry,
} from './whats.new';

const list: WhatsNewEntry[] = [
  { id: '2026-11-02', date: '2 Nov 2026', items: ['c'] },
  { id: '2026-10-30', date: '30 Oct 2026', items: ['b'] },
  { id: '2026-10-20', date: '20 Oct 2026', items: ['a'] },
];

describe('WHATS_NEW list', () => {
  it('is newest first with unique, well-formed ids', () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(WHATS_NEW_ID_PATTERN);
    }
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('every entry has a date and at least one short item', () => {
    for (const entry of WHATS_NEW) {
      expect(entry.date).toBeTruthy();
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(item.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('makes no "coming soon" or preview claims', () => {
    const text = WHATS_NEW.flatMap((e) => e.items).join(' ');
    expect(text).not.toMatch(/coming soon|soon|preview|beta|25\+ platforms|virality/i);
  });

  it('links to the public changelog', () => {
    expect(CHANGELOG_URL).toBe('https://viralgenhub.com/changelog');
  });
});

describe('unseen entries', () => {
  it('a person who never opened the list sees only the newest entry as new', () => {
    expect(unseenWhatsNew(null, list).map((e) => e.id)).toEqual(['2026-11-02']);
    expect(unseenWhatsNew(undefined, list).map((e) => e.id)).toEqual(['2026-11-02']);
  });

  it('counts the entries newer than the last one seen', () => {
    expect(unseenWhatsNew('2026-10-20', list).map((e) => e.id)).toEqual([
      '2026-11-02',
      '2026-10-30',
    ]);
    expect(hasUnseenWhatsNew('2026-11-02', list)).toBe(false);
    expect(hasUnseenWhatsNew('2026-10-30', list)).toBe(true);
  });

  it('a second release on the same day sorts after the first', () => {
    const sameDay: WhatsNewEntry[] = [
      { id: '2026-11-02b', date: '2 Nov 2026', items: ['later'] },
      { id: '2026-11-02', date: '2 Nov 2026', items: ['earlier'] },
    ];
    expect(unseenWhatsNew('2026-11-02', sameDay).map((e) => e.id)).toEqual([
      '2026-11-02b',
    ]);
  });

  it('latest id and known ids', () => {
    expect(latestWhatsNewId(list)).toBe('2026-11-02');
    expect(latestWhatsNewId([])).toBe('');
    expect(isKnownWhatsNewId('2026-10-30', list)).toBe(true);
    expect(isKnownWhatsNewId('2026-10-31', list)).toBe(false);
    expect(isKnownWhatsNewId(42, list)).toBe(false);
    expect(isKnownWhatsNewId(latestWhatsNewId())).toBe(true);
  });
});
