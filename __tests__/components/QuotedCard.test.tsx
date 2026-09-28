/**
 * The card that becomes the PNG.
 *
 * Snapshots cover every look × two text lengths × three ownership states,
 * because the failure mode here is silent: a layout regression produces a
 * perfectly valid-looking card with the words off the edge, and the only
 * person who ever sees it is the stranger it was sent to.
 *
 * The privacy assertions matter more than the snapshots. They are what stops
 * an id, a token or a timestamp being baked into an image that outlives every
 * control we have over it.
 */

jest.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => jest.fn() }) }));

import React from 'react';
import { render } from '@testing-library/react-native';
import QuotedCard from '@/components/share/QuotedCard';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LOOK_IDS, CARD_W, CARD_H } from '@/lib/shareLooks';

const SHORT = 'I never told anyone how much that night changed me.';           // ~52
const LONG  = 'I still set two cups out every morning even though nobody has '
            + 'sat in that chair for three years and I cannot seem to stop.';  // ~150

function draw(props: Partial<React.ComponentProps<typeof QuotedCard>> = {}) {
  return render(
    <ThemeProvider>
      <QuotedCard
        text={SHORT} category="grief" feltCount={217}
        look="classic" seed="fixed-seed" {...props}
      />
    </ThemeProvider>,
  );
}

describe('snapshots — every look, both lengths, all three states', () => {
  for (const look of LOOK_IDS) {
    for (const [len, text] of [['short', SHORT], ['long', LONG]] as const) {
      it(`${look} / ${len} / someone else`, async () => {
        const { toJSON } = await draw({ look, text });
        expect(toJSON()).toMatchSnapshot();
      });

      it(`${look} / ${len} / own sealed`, async () => {
        const { toJSON } = await draw({ look, text, own: true, includeWords: false });
        expect(toJSON()).toMatchSnapshot();
      });

      it(`${look} / ${len} / own with words`, async () => {
        const { toJSON } = await draw({ look, text, own: true, includeWords: true });
        expect(toJSON()).toMatchSnapshot();
      });
    }
  }
});

describe('the card is a fixed capture size', () => {
  it('is 360×640, so a 3× capture is exactly 1080×1920', async () => {
    const { toJSON } = await draw();
    const root = toJSON() as any;
    const style = Array.isArray(root.props.style) ? Object.assign({}, ...root.props.style) : root.props.style;
    expect(style.width).toBe(CARD_W);
    expect(style.height).toBe(CARD_H);
    expect(style.overflow).toBe('hidden');
  });
});

describe('what the words say', () => {
  it('shows the confession for someone else', async () => {
    const { getByTestId } = await draw();
    expect(getByTestId('quoted-card-text').props.children).toBe(SHORT);
  });

  it('seals an own confession — the words are NOT in the tree', async () => {
    const u = await draw({ own: true, includeWords: false, text: 'my private words' });
    expect(u.getByTestId('quoted-card-text').props.children)
      .toBe('Something I wrote was felt by 217 strangers.');
    expect(JSON.stringify(u.toJSON())).not.toContain('my private words');
  });

  it('includes them when asked', async () => {
    const u = await draw({ own: true, includeWords: true, text: 'my private words' });
    expect(u.getByTestId('quoted-card-text').props.children).toBe('my private words');
  });
});

describe('the felt pill', () => {
  it('is drawn for a real count', async () => {
    const { getByTestId } = await draw({ feltCount: 217 });
    expect(getByTestId('quoted-card-pill')).toBeTruthy();
  });

  it('is absent at zero rather than saying "0 felt this too"', async () => {
    const { queryByTestId } = await draw({ feltCount: 0 });
    expect(queryByTestId('quoted-card-pill')).toBeNull();
  });
});

describe('the category chip', () => {
  it('is drawn when the confession has a category', async () => {
    const { getByTestId } = await draw({ category: 'grief' });
    expect(getByTestId('quoted-card-chip')).toBeTruthy();
  });

  it('is absent when it does not', async () => {
    const { queryByTestId } = await draw({ category: null });
    expect(queryByTestId('quoted-card-chip')).toBeNull();
  });
});

describe('nothing identifying is ever drawn', () => {
  const FORBIDDEN = [
    'account_id', 'author_token', 'confession_id', 'confessionId',
    'persona', 'timestamp', 'created_at', 'token',
  ];

  it.each(LOOK_IDS)('%s bakes in no identifier', async (look) => {
    const u = await draw({ look, own: true, includeWords: true });
    const tree = JSON.stringify(u.toJSON());
    for (const f of FORBIDDEN) expect(tree).not.toContain(f);
  });

  it('draws no UUID-shaped string anywhere', async () => {
    const u = await draw();
    expect(JSON.stringify(u.toJSON()))
      .not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('draws no date or clock time', async () => {
    const u = await draw();
    const tree = JSON.stringify(u.toJSON());
    expect(tree).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(tree).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it('carries the bare domain, never a tokenised link', async () => {
    const u = await draw();
    const tree = JSON.stringify(u.toJSON());
    expect(tree).toContain('soulyap.me');
    // The tappable link travels in the share MESSAGE. A token printed into the
    // image would be permanent and un-revocable.
    expect(tree).not.toContain('?c=');
    expect(tree).not.toContain('&t=');
  });
});

describe('the card does not follow the app theme', () => {
  // Asserted on the SOURCE, not by rendering twice: ThemeProvider takes no
  // initial-theme prop, so a "light vs dark" render test renders the same tree
  // twice and passes no matter what the component does.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'components', 'share', 'QuotedCard.tsx'),
    'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('reads no theme hook', () => {
    // It is rasterised and sent to strangers; a card that changed with the
    // sender's own settings would ship two different products.
    expect(code).not.toContain('useTheme');
    expect(code).not.toContain('useThemeColors');
    expect(code).not.toContain('usePalette');
  });

  it('gives every icon an explicit tone', () => {
    // Icon defaults to tone="auto", which reads the theme. Every Icon on this
    // card must name its tone or the card silently becomes theme-dependent.
    const icons = code.match(/<Icon[\s\S]*?\/>/g) ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const i of icons) {
      expect(i).toMatch(/tone=/);
      // "auto" IS the theme-reading default, so merely naming the prop is not
      // enough — an earlier version of this test passed on tone="auto".
      expect(i).not.toMatch(/tone=["'{]?\s*["']?auto/);
    }
  });

  it('renders without a ThemeProvider at all', async () => {
    const { getByTestId } = await render(
      <QuotedCard text={SHORT} category="grief" feltCount={5} look="classic" seed="s" />,
    );
    expect(getByTestId('quoted-card-text')).toBeTruthy();
  });
});

describe('the same seed always draws the same card', () => {
  it('is stable, so the preview and the capture cannot disagree', async () => {
    const a = await draw({ seed: 'abc' });
    const b = await draw({ seed: 'abc' });
    expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(b.toJSON()));
  });

  it('differs between seeds', async () => {
    const a = await draw({ seed: 'abc' });
    const b = await draw({ seed: 'xyz' });
    expect(JSON.stringify(a.toJSON())).not.toBe(JSON.stringify(b.toJSON()));
  });
});
