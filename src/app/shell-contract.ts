import { InjectionToken } from '@angular/core';

/**
 * What the multi-tour-front container guarantees to every portal: a failed request
 * reaches the portal as this shape, never as a raw transport error, and
 * `userMessage` is already decided by the container.
 *
 * Types only, on purpose: the container does not exist yet (G-FRT), so this mirrors
 * the course template and must be reconciled with the contract it publishes.
 */
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: FieldError[];
  traceId: string;
  userMessage: string;
}

/**
 * The session of the container; a LOCAL copy of `MountSession` in multi-tour-front `core/client/types.ts` (HU-FRT-001 amendment 003,
 * D-04: the portal never imports the container). Both name fields are optional: an older container sends only `roles`.
 */
export interface MountSession {
  readonly roles: string[];
  /** Name to greet the person with. Absent when the container does not know it. */
  displayName?: string;
  /** One or two uppercase letters for the avatar; the portal derives them from displayName when absent. */
  initials?: string;
  open(answer: unknown): void;
  close(): void;
}

/** What the container hands to `mount` (ADR-006 F4); mirrors multi-tour-front `core/client/types.ts`. */
export interface MountProps {
  identifier?: string;
  apiClient: { request<T>(path: string, init?: unknown): Promise<T> };
  session: MountSession;
  /** PROPUESTO for ADR-007 (008- H-D10): parameters the container keeps across a remount, e.g. a selection in progress. */
  initialParams?: Readonly<Record<string, string>>;
  /** Asks the container to open an area of another portal; absent, the Perfil button and the avatar link are not drawn. */
  navigate?: (target: PortalTarget) => void;
  /** The commercial name of the company (multi-tour-front `core/client/types.ts`, tenant mounts only; absent when blank): the strip "Operador activo" of 10B. */
  commercialName?: string;
  /** Who draws the navigation chrome: 'container' means the container draws the sidebar and the portal only shows its content; absent, the portal draws its own. */
  chrome?: 'container';
}

/** The container's `navigate` as the screens read it; null when the container does not offer it. */
export const CONTAINER_NAVIGATION = new InjectionToken<((target: PortalTarget) => void) | null>('CONTAINER_NAVIGATION', { factory: () => null });

/** The commercial name the container sent, or null; screens draw their strip only when it is there (007- V3, amended). */
export const COMMERCIAL_NAME = new InjectionToken<string | null>('COMMERCIAL_NAME', { factory: () => null });

/** true when the container draws the navigation (MountProps.chrome === 'container'): the operator shell then omits its sidebar. */
export const CONTAINER_CHROME = new InjectionToken<boolean>('CONTAINER_CHROME', { factory: () => false });

/** The area the container asked to open at mount (MountProps.initialParams.area), or null. */
export const INITIAL_AREA = new InjectionToken<string | null>('INITIAL_AREA', { factory: () => null });

export type PortalApiClient = MountProps['apiClient'];
