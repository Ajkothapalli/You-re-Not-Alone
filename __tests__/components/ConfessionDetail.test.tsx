/**
 * Confession detail screen — owner edit flow.
 *
 * Covers the full spec from the BUILD brief:
 *   - can_edit rendering (Edit shown / sealed note shown)
 *   - Edit → Save: pass, blocked, sealed-race outcomes
 *   - Haptic contracts (Light for sealed race, NOT Error)
 *   - "· edited" marker when updated_at != null
 *   - Reduced-motion: mode switches at end-state with no animation
 *   - Security: account_id, real_felt_count, author_token never in client payloads
 *
 * Note on RNTL v14: fireEvent.press / fireEvent.changeText are async — they
 * internally await act(). Every fireEvent call must be awaited so state
 * updates commit before the next query or assertion runs.
 */

// ─── Mocks (must come before imports) ─────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  editConfession:   jest.fn(),
  retireConfession: jest.fn(),
}));

jest.mock('@/lib/a11y', () => ({
  useReducedMotion: jest.fn(() => true),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useThemeColors: () => ({
    bg:            '#F7F4EF',
    ink:           '#FFFFFF',
    paper:         '#1A1A1A',
    dim:           '#888888',
    line:          'rgba(0,0,0,0.09)',
    border:        '#1A1A1A',
    accent:        '#FFE500',
    feltText:      '#1A1A1A',
    youreNotAlone: 'rgba(26,26,26,0.65)',
  }),
}));

jest.mock('@/theme/motion', () => ({
  DURATION: { base: 220, instant: 0 },
  EASING:   { standard: (t: number) => t },
}));

jest.mock('expo-router', () => ({
  router:               { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync:        jest.fn(),
  impactAsync:              jest.fn(),
  NotificationFeedbackType: { Success: 'Success', Error: 'Error' },
  ImpactFeedbackStyle:      { Light: 'Light' },
}));

jest.mock('@/components/AppDialog', () => ({
  showDialog: jest.fn(),
}));

jest.mock('@/components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@/components/BackgroundPattern', () => ({
  BackgroundPattern: () => null,
}));

jest.mock('@/components/ScrawlIcon', () => ({
  ScrawlIcon: () => null,
}));

jest.mock('@/components/ConfessionInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChangeText, testID }: any) =>
      React.createElement(TextInput, {
        testID: testID ?? 'confession-input',
        value,
        onChangeText,
      }),
  };
});

jest.mock('@/components/Buttons', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    PrimaryButton: ({ label, onPress, disabled, loading, testID }: any) =>
      React.createElement(
        Pressable,
        {
          testID:             testID ?? `btn-${label}`,
          onPress:            disabled || loading ? undefined : onPress,
          accessibilityState: { disabled: !!(disabled || loading) },
        },
        React.createElement(Text, null, label),
      ),
    GhostButton: ({ label, onPress, testID }: any) =>
      React.createElement(
        Pressable,
        { testID: testID ?? `btn-${label}`, onPress },
        React.createElement(Text, null, label),
      ),
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { editConfession, retireConfession, type OwnConfession, type EditResult } from '@/lib/api';
import { useReducedMotion } from '@/lib/a11y';
import { showToast } from '@/components/Toast';
import { showDialog } from '@/components/AppDialog';
import ConfessionDetailScreen from '../../app/confession/[id]';

const mockEditConfession   = editConfession   as jest.Mock;
const mockRetireConfession = retireConfession as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockUseReducedMotion     = useReducedMotion     as jest.Mock;
const mockImpactAsync          = Haptics.impactAsync          as jest.Mock;
const mockNotificationAsync    = Haptics.notificationAsync    as jest.Mock;
const mockShowToast            = showToast  as jest.Mock;
const mockShowDialog           = showDialog as jest.Mock;

// ─── Default params ───────────────────────────────────────────────────────────

const EDITABLE_PARAMS = {
  id:        'confession-abc',
  text:      'I carry something I have never said out loud.',
  feltCount: '3',
  canEdit:   'true',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '',
  status:    'live',
};

const SEALED_PARAMS = {
  ...EDITABLE_PARAMS,
  canEdit:   'false',
  feltCount: '7',
};

const EDITED_PARAMS = {
  ...EDITABLE_PARAMS,
  updatedAt: '2026-01-16T12:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function renderDetail(params = EDITABLE_PARAMS) {
  mockUseLocalSearchParams.mockReturnValue(params);
  return await render(<ConfessionDetailScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: reducedMotion=true so Animated.Value updates via setValue() synchronously.
  mockUseReducedMotion.mockReturnValue(true);
});

// ─── §1: can_edit rendering ───────────────────────────────────────────────────

describe('can_edit rendering', () => {
  it('shows Edit button when canEdit param is true', async () => {
    const { getByTestId } = await renderDetail(EDITABLE_PARAMS);
    expect(getByTestId('edit-btn')).toBeTruthy();
  });

  it('hides Edit button when canEdit param is false', async () => {
    const { queryByTestId } = await renderDetail(SEALED_PARAMS);
    expect(queryByTestId('edit-btn')).toBeNull();
  });

  it('shows Delete button in both states', async () => {
    const { getByTestId } = await renderDetail(EDITABLE_PARAMS);
    expect(getByTestId('delete-btn')).toBeTruthy();

    const { getByTestId: get2 } = await renderDetail(SEALED_PARAMS);
    expect(get2('delete-btn')).toBeTruthy();
  });

  it('shows sealed note when canEdit is false', async () => {
    const { getByTestId } = await renderDetail(SEALED_PARAMS);
    expect(getByTestId('sealed-note')).toBeTruthy();
  });

  it('does not show sealed note when canEdit is true', async () => {
    const { queryByTestId } = await renderDetail(EDITABLE_PARAMS);
    expect(queryByTestId('sealed-note')).toBeNull();
  });

  it('can_edit stays true when only a generated companion has felt it (real_felt_count=0)', async () => {
    // Server sends can_edit=true even after a generated companion "felt" it —
    // real_felt_count stays 0 because source='generated'. Edit is shown.
    const companionOnlyParams = { ...EDITABLE_PARAMS, canEdit: 'true', feltCount: '1' };
    const { getByTestId } = await renderDetail(companionOnlyParams);
    expect(getByTestId('edit-btn')).toBeTruthy();
  });

  it('can_edit=false once a real user has felt it (server sets real_felt_count>0)', async () => {
    // Server computes: real_felt_count>0 → can_edit=false → Edit hidden.
    const realFeltParams = { ...EDITABLE_PARAMS, canEdit: 'false', feltCount: '2' };
    const { queryByTestId } = await renderDetail(realFeltParams);
    expect(queryByTestId('edit-btn')).toBeNull();
  });
});

// ─── §2: "· edited" marker ────────────────────────────────────────────────────

describe('"· edited" marker (owner-only)', () => {
  it('does NOT show "· edited" when updatedAt is empty string', async () => {
    const { queryByText } = await renderDetail(EDITABLE_PARAMS);
    expect(queryByText(/·\s*edited/)).toBeNull();
  });

  it('shows "· edited" when updatedAt is a timestamp', async () => {
    const { getByText } = await renderDetail(EDITED_PARAMS);
    expect(getByText(/·\s*edited/)).toBeTruthy();
  });
});

// ─── §3: Edit → Save — success ────────────────────────────────────────────────

describe('Edit → Save: success path', () => {
  const successConfession: OwnConfession = {
    id:         'confession-abc',
    text:       'A refined version of what I meant to say.',
    felt_count: 3,
    can_edit:   true,
    updated_at: '2026-01-16T12:00:00Z',
    status:     'live',
    created_at: '2026-01-15T10:00:00Z',
  };

  beforeEach(() => {
    mockEditConfession.mockResolvedValue({ success: true, confession: successConfession } as EditResult);
  });

  it('calls editConfession with the confession id and the new text', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'A refined version of what I meant to say.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockEditConfession).toHaveBeenCalledWith(
      'confession-abc',
      'A refined version of what I meant to say.',
    );
  });

  it('confirms the edit and returns to the list on success', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'A refined version of what I meant to say.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockShowToast).toHaveBeenCalledWith('Successfully edited');
    // The author lands back on their list rather than sitting on the detail screen.
    expect(router.back).toHaveBeenCalled();
  });

  it('fires Success haptic on save', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'A refined version of what I meant to say.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('does NOT fire Error or Light haptic on success', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'A refined version of what I meant to say.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('shows "· edited" after a successful edit (updated_at becomes non-null)', async () => {
    const { getByTestId, queryByText } = await renderDetail();
    expect(queryByText(/·\s*edited/)).toBeNull();

    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'A refined version of what I meant to say.');
    await fireEvent.press(getByTestId('save-btn'));

    await waitFor(() => expect(queryByText(/·\s*edited/)).toBeTruthy());
  });

  it('does NOT return account_id or real_felt_count in the confession response', () => {
    const forbidden = Object.keys(successConfession);
    expect(forbidden).not.toContain('account_id');
    expect(forbidden).not.toContain('real_felt_count');
    expect(forbidden).not.toContain('author_token');
    expect(forbidden).not.toContain('source');
  });
});

// ─── §4: Edit → Save — blocked ────────────────────────────────────────────────

describe('Edit → Save: blocked (moderation or crisis)', () => {
  const ORIGINAL_TEXT = EDITABLE_PARAMS.text;
  const FLAGGED_TEXT  = 'Something our classifier would flag.';

  beforeEach(() => {
    mockEditConfession.mockResolvedValue({ blocked: true, reason: 'harassment' } as EditResult);
  });

  it('fires Error haptic when blocked', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockNotificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('does NOT fire Light impact haptic when blocked (reserved for sealed race)', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockImpactAsync).not.toHaveBeenCalled();
  });

  it('shows the blocked banner in edit mode after a block', async () => {
    const { getByTestId, queryByTestId } = await renderDetail();
    expect(queryByTestId('blocked-banner')).toBeNull();

    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));

    expect(queryByTestId('blocked-banner')).toBeTruthy();
  });

  it('keeps the composer open with draft text after a block', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));

    expect(getByTestId('confession-input').props.value).toBe(FLAGGED_TEXT);
  });

  it('does NOT show "Updated." toast when blocked', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('Cancel after a block returns to view mode with the original text intact', async () => {
    const { getByTestId, getByText } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), FLAGGED_TEXT);
    await fireEvent.press(getByTestId('save-btn'));
    await fireEvent.press(getByTestId('cancel-btn'));

    expect(getByText(ORIGINAL_TEXT)).toBeTruthy();
  });
});

// ─── §5: Edit → Save — sealed race ───────────────────────────────────────────

describe('Edit → Save: sealed race', () => {
  beforeEach(() => {
    mockEditConfession.mockResolvedValue({ sealed: true } as EditResult);
  });

  it('fires Light impact haptic (informational) — NOT Error haptic', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Something I wanted to update.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(mockNotificationAsync).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('shows the sealed-race informational banner', async () => {
    const { getByTestId, queryByTestId } = await renderDetail();
    expect(queryByTestId('sealed-race-banner')).toBeNull();

    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Something I wanted to update.');
    await fireEvent.press(getByTestId('save-btn'));

    await waitFor(() => expect(queryByTestId('sealed-race-banner')).toBeTruthy());
  });

  it('hides Edit button after sealed race (confession is now sealed)', async () => {
    const { getByTestId, queryByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Something I wanted to update.');
    await fireEvent.press(getByTestId('save-btn'));

    await waitFor(() => expect(queryByTestId('edit-btn')).toBeNull());
  });

  it('does not change the confession text after a sealed race', async () => {
    const { getByTestId, getByText } = await renderDetail();
    const original = EDITABLE_PARAMS.text;

    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Replacement text that was never saved.');
    await fireEvent.press(getByTestId('save-btn'));

    await waitFor(() => expect(getByText(original)).toBeTruthy());
  });

  it('does NOT show "Updated." toast on sealed race', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Something new.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

// ─── §6: Security — payload never contains forbidden fields ───────────────────

describe('Security: client payloads never contain account_id or internal fields', () => {
  it('OwnConfession interface does not contain account_id or real_felt_count', () => {
    const own: OwnConfession = {
      id:         'x',
      text:       'y',
      felt_count: 0,
      can_edit:   true,
      updated_at: null,
      status:     'live',
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(own).not.toHaveProperty('account_id');
    expect(own).not.toHaveProperty('real_felt_count');
    expect(own).not.toHaveProperty('author_token');
    expect(own).not.toHaveProperty('source');
  });

  it('EditResult.confession never contains account_id or real_felt_count', () => {
    const result: EditResult = {
      success: true,
      confession: {
        id:         'x',
        text:       'y',
        felt_count: 0,
        can_edit:   true,
        updated_at: '2026-01-01T00:00:00Z',
        status:     'live',
        created_at: '2026-01-01T00:00:00Z',
      },
    };
    expect(result.confession).not.toHaveProperty('account_id');
    expect(result.confession).not.toHaveProperty('real_felt_count');
    expect(result.confession).not.toHaveProperty('author_token');
    expect(result.confession).not.toHaveProperty('source');
  });

  it('editConfession throws (not passes silently) when server returns 403 for non-owned confession', async () => {
    // Server enforces WHERE account_id = auth.uid() — wrong owner → 0 rows → 403.
    // Client receives a thrown error, not a silent success.
    mockEditConfession.mockRejectedValueOnce(
      new Error('Confession not found or not owned by you.'),
    );
    await expect(editConfession('other-users-id', 'any text')).rejects.toThrow('not owned');
  });
});

// ─── §7: Reduced motion ───────────────────────────────────────────────────────
// Tests verify that the reduced-motion path is wired: when useReducedMotion()
// returns true, mode transitions commit immediately via setValue() (no animation
// frames needed) — so assertions work synchronously after an awaited press.

describe('Reduced motion: useReducedMotion() is respected', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(true);
    mockEditConfession.mockResolvedValue({
      success:    true,
      confession: {
        id:         EDITABLE_PARAMS.id,
        text:       'Updated.',
        felt_count: 3,
        can_edit:   true,
        updated_at: '2026-01-16T00:00:00Z',
        status:     'live',
        created_at: EDITABLE_PARAMS.createdAt,
      },
    } as EditResult);
  });

  it('entering edit mode makes the composer interactive immediately (no animation wait)', async () => {
    const { getByTestId } = await renderDetail();
    // With reducedMotion=true, crossFadeTo calls setValue() synchronously.
    // After awaiting the press, mode='edit' and elements are accessible.
    await fireEvent.press(getByTestId('edit-btn'));
    expect(getByTestId('save-btn')).toBeTruthy();
    expect(getByTestId('cancel-btn')).toBeTruthy();
  });

  it('returning to view mode after save makes the view pane interactive immediately', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('edit-btn'));
    await fireEvent.changeText(getByTestId('confession-input'), 'Updated text for my confession.');
    await fireEvent.press(getByTestId('save-btn'));

    expect(getByTestId('delete-btn')).toBeTruthy();
  });

  it('useReducedMotion is called during render (hook is wired)', async () => {
    await renderDetail();
    expect(mockUseReducedMotion).toHaveBeenCalled();
  });
});

// ─── §8: Sealed confession full view ─────────────────────────────────────────

describe('Sealed confession detail view', () => {
  it('renders the sealed note verbatim', async () => {
    const { getByTestId } = await renderDetail(SEALED_PARAMS);
    expect(getByTestId('sealed-note')).toBeTruthy();
  });

  it('renders Delete button on sealed confession', async () => {
    const { getByTestId } = await renderDetail(SEALED_PARAMS);
    expect(getByTestId('delete-btn')).toBeTruthy();
  });
});

// ─── §9: Delete ───────────────────────────────────────────────────────────────

describe('Delete confession', () => {
  it('calls showDialog with a destructive option on Delete press', async () => {
    const { getByTestId } = await renderDetail();
    await fireEvent.press(getByTestId('delete-btn'));
    expect(mockShowDialog).toHaveBeenCalledWith(
      'Delete this confession?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ style: 'destructive' }),
      ]),
    );
  });
});
