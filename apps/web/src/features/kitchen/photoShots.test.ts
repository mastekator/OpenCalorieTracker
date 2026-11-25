import { describe, expect, it } from 'vitest';
import { mapRows, shotRows, withShot, type Shot } from './photoShots';

const file = new File([], 'p.jpg');
const shot = (key: number, state: Shot<string>['state']): Shot<string> => ({
  key,
  file,
  url: '',
  state,
});

describe('photo shots', () => {
  it('lists recognized rows in photo order, skipping waiting and failed photos', () => {
    const shots = [
      shot(1, ['a', 'b']),
      shot(2, 'wait'),
      shot(3, 'error'),
      shot(4, ['c']),
    ];
    expect(shotRows(shots)).toEqual(['a', 'b', 'c']);
  });

  it('a later photo finishing first still lands after the earlier one', () => {
    const shots = withShot([shot(1, 'wait'), shot(2, 'wait')], 2, ['late']);
    expect(shotRows(withShot(shots, 1, ['early']))).toEqual(['early', 'late']);
  });

  it('maps rows of recognized photos only', () => {
    const shots = mapRows([shot(1, ['a', 'b']), shot(2, 'error')], (rs) =>
      rs.filter((r) => r !== 'a'),
    );
    expect(shots.map((s) => s.state)).toEqual([['b'], 'error']);
  });
});
