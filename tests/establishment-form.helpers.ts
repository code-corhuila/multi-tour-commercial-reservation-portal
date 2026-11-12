/** Types the reason in the open "Cambiar estado" panel and confirms it (HU-COM-002, AC-PE.13). */
export async function confirmChange(element: HTMLElement, settle: () => Promise<void>, reason = 'Cerrado por obras') {
  const area = element.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!;
  area.value = reason; area.dispatchEvent(new Event('input')); await settle();
  Array.from(element.querySelectorAll('button')).find((button) => /^Confirmar (in|re)activación$/.test(button.textContent?.trim() ?? ''))!.click(); await settle();
}
export function imageFile(size = 100, type = 'image/png') { return new File([new Uint8Array(size)], 'association.png', { type }); }
export async function formControls(element: HTMLElement, settle: () => Promise<void>) {
  const field = (name: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const text = async (name: string, value: string) => {
    field(name).value = value; field(name).dispatchEvent(new Event('input')); await settle();
  };
  const choose = async (file: File | null) => {
    Object.defineProperty(field('image'), 'files', { value: file ? [file] : [], configurable: true });
    field('image').dispatchEvent(new Event('change')); await settle();
  };
  const submit = async () => { element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  const fill = async () => { await text('commercialName', 'Hotel Alpha'); await text('commercialInformation', 'Description and contact.'); await text('contactEmail', 'info@hotel.example'); await choose(imageFile()); };
  const errorFor = (name: string) => {
    const ids = field(name).getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids.filter((id) => id.endsWith('-error')).map((id) => element.querySelector(`[id="${id}"]`)?.textContent ?? '').join(' ');
  };
  return { field, text, choose, submit, fill, errorFor };
}
