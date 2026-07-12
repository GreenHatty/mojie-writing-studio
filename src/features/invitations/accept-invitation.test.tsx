import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcceptInvitation } from './accept-invitation';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('AcceptInvitation', () => {
  it('submits credentials to the token-scoped endpoint and never displays the token', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ userId: 'u' })); vi.stubGlobal('fetch', fetchMock); render(<AcceptInvitation token="secret-token" />);
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'writer' } }); fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'very-strong-password' } }); fireEvent.click(screen.getByRole('button', { name: '接受邀请' }));
    expect(await screen.findByText('邀请已接受，请返回登录')).toBeTruthy(); expect(fetchMock.mock.calls[0][0]).toBe('/api/invitations/secret-token/accept'); expect(screen.queryByText('secret-token')).toBeNull();
  });
});
