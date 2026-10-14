/** Texts of the greeting and the avatar of the client header (panel-cliente.html); the container sends data, never text. */
export const SESSION_TEXT = {
  anonymousGreeting: 'Hola, bienvenido',
  greeting: (name: string): string => `Hola, ${name}`,
  avatarLabel: 'Perfil del usuario',
  /** The dark filled button of the client header: opens the profile of the identity portal. */
  profile: 'Perfil',
  /** The avatar of the mockup when the person has no name. */
  neutralInitials: 'FN',
} as const;
