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
  const fill = async () => { await text('commercialName', 'Hotel Alpha'); await text('commercialInformation', 'Description and contact.'); await choose(imageFile()); };
  const errorFor = (name: string) => {
    const ids = field(name).getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids.filter((id) => id.endsWith('-error')).map((id) => element.querySelector(`[id="${id}"]`)?.textContent ?? '').join(' ');
  };
  return { field, text, choose, submit, fill, errorFor };
}
