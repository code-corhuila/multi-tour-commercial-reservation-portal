export const IMAGE_LIMIT = 819200;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const IMAGE_GUIDANCE = 'Máximo 800 KB (819200 bytes). Tipos aceptados: PNG, JPEG, WebP.';

/** A browser courtesy only: the service verifies the content, regardless of the declared type. */
export function imageMessage(file: File | null): string {
  if (!file) { return 'La imagen es obligatoria.'; }
  return file.size > IMAGE_LIMIT || !(IMAGE_TYPES as readonly string[]).includes(file.type) ? IMAGE_GUIDANCE : '';
}
