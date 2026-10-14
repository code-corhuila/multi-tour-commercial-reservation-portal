import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps, MountSession } from '../src/app/shell-contract';
import { sessionIdentityOf } from '../src/app/shared/session-identity';
import { SESSION_TEXT } from '../src/app/shared/session-copy';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

const NO_OP = { open: () => undefined, close: () => undefined };

describe('theLocalSessionContractCopiesTheFieldsOfTheContainer (HU-FRT-001 amendment 003, D-04)', () => {
  it('declares displayName and initials as optional, additive fields next to roles', () => {
    const roles: MountSession = { roles: ['FINAL_CUSTOMER'], ...NO_OP };
    const named: MountSession = { roles: [], displayName: 'Ana Pérez', initials: 'AP', ...NO_OP };
    expect(roles.displayName).toBeUndefined();
    expect(named.displayName).toBe('Ana Pérez');
    const source = readFileSync('src/app/shell-contract.ts', 'utf8');
    expect(source).toMatch(/displayName\?: string/);
    expect(source).toMatch(/initials\?: string/);
    // D-04: the portal keeps a local copy and never imports the container.
    expect(source).not.toMatch(/from ['"][^'"]*multi-tour-front/);
  });

  it('keeps MountProps.session the type of the contract', () => {
    const props: MountProps = { apiClient: { request: vi.fn() } as never, session: { roles: [], displayName: 'Ana', ...NO_OP } };
    expect(props.session.displayName).toBe('Ana');
  });
});

describe('theSessionIdentityIsReadFromTheSession (RN-FRT-16, RN-FRT-18)', () => {
  it('uses the display name trimmed, and the initials given', () => {
    expect(sessionIdentityOf({ displayName: '  Ana Pérez ', initials: 'ap' })).toEqual({ name: 'Ana Pérez', initials: 'AP' });
  });

  it('derives the initials from the name when the container sends none (DP-FRT-2)', () => {
    expect(sessionIdentityOf({ displayName: 'ana maría pérez' }).initials).toBe('AM');
    expect(sessionIdentityOf({ displayName: 'Ana' }).initials).toBe('A');
    expect(sessionIdentityOf({ displayName: 'Ana', initials: '   ' }).initials).toBe('A');
    // Only letters and digits count: punctuation never becomes an initial.
    expect(sessionIdentityOf({ displayName: '"Álvaro" (Pérez)' }).initials).toBe('ÁP');
    expect(sessionIdentityOf({ displayName: '- . *' }).initials).toBe(SESSION_TEXT.neutralInitials);
  });

  it.each([undefined, '', '   ', 7, null])('has no name and the neutral avatar for %j', (displayName) => {
    expect(sessionIdentityOf({ displayName } as never)).toEqual({ name: null, initials: SESSION_TEXT.neutralInitials });
  });

  it('keeps the greeting texts in the copy file', () => {
    expect(SESSION_TEXT.anonymousGreeting).toBe('Hola, bienvenido');
    expect(SESSION_TEXT.greeting('Ana')).toBe('Hola, Ana');
    expect(SESSION_TEXT.avatarLabel).toBe('Perfil del usuario');
  });
});

describe('theMountedPortalGreetsAndDrawsTheAvatar (panel-cliente.html)', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  const mountWithSession = (session: Partial<MountSession>) => {
    host = document.createElement('div');
    document.body.append(host);
    const props: MountProps = { apiClient: { request: vi.fn() } as never, session: { roles: ['FINAL_CUSTOMER'], ...NO_OP, ...session } };
    cleanup = entry.mountWith(host, props, demoSources);
    return vi.waitFor(() => expect(host.querySelector('.crp-panel-hero h1')).toBeTruthy());
  };
  afterEach(() => { cleanup?.(); host.remove(); });

  it('greets with the display name and shows the initials in the header', async () => {
    await mountWithSession({ displayName: 'Camila Restrepo' });
    expect(host.querySelector('.crp-panel-hero h1')?.textContent).toBe('Hola, Camila Restrepo');
    const avatar = host.querySelector('.crp-client-panel-header .crp-client-avatar');
    expect(avatar?.textContent?.trim()).toBe('CR');
    expect(avatar?.getAttribute('aria-label')).toBe('Perfil del usuario');
  });

  it('says Hola, bienvenido with the neutral avatar when the session has no name', async () => {
    await mountWithSession({});
    expect(host.querySelector('.crp-panel-hero h1')?.textContent).toBe('Hola, bienvenido');
    expect(host.querySelector('.crp-client-avatar')?.textContent?.trim()).toBe('FN');
  });

  it('says Hola, bienvenido when the name is blank', async () => {
    await mountWithSession({ displayName: '   ' });
    expect(host.querySelector('.crp-panel-hero h1')?.textContent).toBe('Hola, bienvenido');
  });

  it('shows a name with markup as text, never as HTML', async () => {
    await mountWithSession({ displayName: '<img src=x onerror=alert(1)>Ana' });
    const title = host.querySelector('.crp-panel-hero h1')!;
    expect(title.querySelector('img')).toBeNull();
    expect(title.textContent).toBe('Hola, <img src=x onerror=alert(1)>Ana');
    expect(host.querySelector('.crp-client-panel-header img')).toBeNull();
  });

  it('keeps the name out of web storage (RN-FRT-17)', async () => {
    await mountWithSession({ displayName: 'Camila Restrepo' });
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('Camila');
  });
});

describe('theDemoOffersASessionWithAName (?demoFixtures=named-session)', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); host.remove(); history.replaceState(null, '', '/'); });

  it('greets Camila Restrepo only when the fixture is asked for', async () => {
    history.replaceState(null, '', '/?demoFixtures=named-session');
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mountWith(host, { apiClient: { request: vi.fn() } as never, session: { roles: ['FINAL_CUSTOMER'], ...NO_OP } }, demoSources);
    await vi.waitFor(() => expect(host.querySelector('.crp-panel-hero h1')?.textContent).toBe('Hola, Camila Restrepo'));
    expect(host.querySelector('.crp-client-avatar')?.textContent?.trim()).toBe('CR');
  });
});
