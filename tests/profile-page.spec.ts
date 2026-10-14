import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CLIENT_AREA } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ProfilePageComponent } from '../src/app/profile/pages/profile-page.component';
import { SESSION_IDENTITY, sessionIdentityOf } from '../src/app/shared/session-identity';

function openProfile(session: Parameters<typeof sessionIdentityOf>[0]) {
  TestBed.configureTestingModule({ providers: [PortalNavigation, { provide: SESSION_IDENTITY, useValue: sessionIdentityOf(session) }] });
  const navigation = TestBed.inject(PortalNavigation);
  navigation.register([CLIENT_AREA.panel]);
  const fixture = TestBed.createComponent(ProfilePageComponent);
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  const values = () => Array.from(host.querySelectorAll<HTMLInputElement>('.crp-profile-field input'), (input) => input.value);
  return { host, values, navigation };
}

describe('theProfileDrawsOnlyWhatTheSessionDelivers (profile.html)', () => {
  it('draws the top bar, the large avatar with the initials and the name of the session', () => {
    const { host, values } = openProfile({ displayName: 'Camila Restrepo' });
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Mi perfil');
    expect(host.querySelector('.crp-profile-back')?.textContent?.trim()).toBe('← Volver al panel cliente');
    expect(host.querySelector('.crp-profile-avatar')?.textContent?.trim()).toBe('CR');
    expect(host.querySelector('.crp-profile-identity strong')?.textContent?.trim()).toBe('Camila Restrepo');
    expect(Array.from(host.querySelectorAll('.crp-profile-field > span'), (label) => label.textContent?.trim()))
      .toEqual(['Nombre completo', 'Correo electrónico', 'Rol']);
    expect(values()).toEqual(['Camila Restrepo', 'No registrado', 'Cliente']);
  });

  it('says No registrado and keeps the neutral avatar when the session has no name, inventing nothing', () => {
    const { host, values } = openProfile({});
    expect(host.querySelector('.crp-profile-avatar')?.textContent?.trim()).toBe('FN');
    expect(host.querySelector('.crp-profile-identity strong')?.textContent?.trim()).toBe('No registrado');
    expect(values()).toEqual(['No registrado', 'No registrado', 'Cliente']);
  });

  it('declares what the session does not deliver instead of drawing teléfono, operador or contraseña', () => {
    const { host } = openProfile({ displayName: 'Camila Restrepo' });
    const note = host.querySelector('[data-part="blocked"]');
    expect(note?.textContent).toContain('Tu sesión aún no entrega correo, teléfono ni operador');
    expect(host.textContent).not.toMatch(/Cambiar contraseña|Editar perfil|Cerrar sesión/);
    expect(host.querySelector('input[type="tel"]')).toBeNull();
  });

  it('shows a name with markup as text and opens the panel cliente from both links back', () => {
    const { host, navigation } = openProfile({ displayName: '<img src=x onerror=alert(1)>Ana' });
    expect(host.querySelector('img')).toBeNull();
    host.querySelector<HTMLButtonElement>('.crp-profile-back')!.click();
    expect(navigation.selected()).toBe(CLIENT_AREA.panel);
    navigation.selected.set(undefined);
    Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-profile-row')).find((row) => row.textContent?.includes('Volver al panel'))!.click();
    expect(navigation.selected()).toBe(CLIENT_AREA.panel);
  });
});
