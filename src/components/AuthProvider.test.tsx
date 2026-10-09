/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

vi.mock('@/lib/auth/actions', () => ({
  signOut: vi.fn(async () => ({ ok: true })),
}));

import { useAuth } from '@/lib/auth/context';
import { AuthProvider } from './AuthProvider';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function CurrentAuth() {
  const { status, user, refresh } = useAuth();
  return (
    <div>
      <output data-status={status}>{user?.id ?? 'none'}</output>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}

describe('AuthProvider refresh failure handling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.onAuthStateChange.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderProvider() {
    await act(async () => {
      root.render(
        <AuthProvider>
          <CurrentAuth />
        </AuthProvider>,
      );
    });
  }

  async function clickRefresh() {
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('settles to anonymous without an unhandled rejection if refresh rejects', async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } } })
      .mockRejectedValueOnce(new Error('network unavailable'));

    await renderProvider();
    expect(container.querySelector('output')?.dataset.status).toBe('authenticated');
    expect(container.querySelector('output')?.textContent).toBe('user-1');

    await clickRefresh();

    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(container.querySelector('output')?.dataset.status).toBe('anonymous');
    expect(container.querySelector('output')?.textContent).toBe('none');
  });

  it('still applies a successful refreshed session', async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'user-2' } } } });

    await renderProvider();
    expect(container.querySelector('output')?.dataset.status).toBe('anonymous');

    await clickRefresh();

    expect(container.querySelector('output')?.dataset.status).toBe('authenticated');
    expect(container.querySelector('output')?.textContent).toBe('user-2');
  });

  it('settles to anonymous if the initial session read rejects', async () => {
    mocks.getSession.mockRejectedValueOnce(new Error('offline'));

    await renderProvider();

    expect(container.querySelector('output')?.dataset.status).toBe('anonymous');
    expect(container.querySelector('output')?.textContent).toBe('none');
  });
});
