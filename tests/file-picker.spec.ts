import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FilePickerComponent } from '../src/app/shared/file-picker.component';

@Component({
  imports: [FilePickerComponent],
  template: `<app-file-picker inputId="proof" inputName="proof" accept=".png" [file]="file()" [disabled]="disabled()" (chosen)="chosen.push($event)" />`,
})
class HostDouble {
  readonly file = signal<File | null>(null);
  readonly disabled = signal(false);
  readonly chosen: (File | null)[] = [];
}

async function openPicker() {
  const fixture = TestBed.createComponent(HostDouble);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
  return { fixture, settle, element, input, host: fixture.componentInstance };
}

describe('filePickerSpeaksSpanish', () => {
  it('replaces the browser text with "Seleccionar archivo" and "Ningún archivo seleccionado"', async () => {
    const { element, input } = await openPicker();
    expect(element.querySelector('.crp-file-picker-button')?.textContent?.trim()).toBe('Seleccionar archivo');
    expect(element.querySelector('.crp-file-picker-name')?.textContent?.trim()).toBe('Ningún archivo seleccionado');
    expect(input.id).toBe('proof'); expect(input.name).toBe('proof'); expect(input.accept).toBe('.png');
  });
  it('emits the chosen file and shows the name the host keeps', async () => {
    const { input, host, settle, element } = await openPicker();
    const file = new File(['x'], 'soporte.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change')); await settle();
    expect(host.chosen).toEqual([file]);
    host.file.set(file); await settle();
    expect(element.querySelector('.crp-file-picker-name')?.textContent?.trim()).toBe('soporte.png');
  });
  it('opens the native picker from its button and follows the disabled state', async () => {
    const { input, host, settle, element } = await openPicker();
    let opened = 0; input.click = () => { opened++; };
    element.querySelector<HTMLElement>('.crp-file-picker-button')!.click();
    expect(opened).toBe(1);
    host.disabled.set(true); await settle();
    expect(input.disabled).toBe(true);
    element.querySelector<HTMLElement>('.crp-file-picker-button')!.click();
    expect(opened).toBe(1);
  });
});
