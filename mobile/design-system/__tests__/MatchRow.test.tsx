import { render } from '@testing-library/react-native';
import { MatchRow } from '../MatchRow';
import type { MatchCard } from '@shared/types/common';

const fixture: MatchCard = {
  id: 'm1',
  apiId: null,
  date: '2026-05-15T19:00:00Z',
  status: 'scheduled',
  minute: null,
  home: {
    team: { id: 't1', apiId: null, nameEn: 'Home', nameHe: 'בית', logoUrl: null },
    score: null,
  },
  away: {
    team: { id: 't2', apiId: null, nameEn: 'Away', nameHe: 'חוץ', logoUrl: null },
    score: null,
  },
  leagueId: 'l1',
  leagueName: 'ליגת העל',
};

describe('MatchRow', () => {
  test('renders scheduled match (no scores)', () => {
    const { toJSON } = render(<MatchRow match={fixture} />);
    expect(toJSON()).toMatchSnapshot();
  });

  test('renders finished match with scores', () => {
    const finished: MatchCard = {
      ...fixture,
      status: 'finished',
      home: { ...fixture.home, score: 2 },
      away: { ...fixture.away, score: 1 },
    };
    const { toJSON } = render(<MatchRow match={finished} />);
    expect(toJSON()).toMatchSnapshot();
  });

  test('renders live match with minute', () => {
    const live: MatchCard = {
      ...fixture,
      status: 'live',
      minute: 67,
      home: { ...fixture.home, score: 1 },
      away: { ...fixture.away, score: 1 },
    };
    const { toJSON } = render(<MatchRow match={live} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
