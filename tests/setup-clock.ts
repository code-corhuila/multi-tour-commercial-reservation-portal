import { beforeEach, vi } from 'vitest';

/**
 * The suite never reads the real calendar: the system time is fixed at the day the demo data and the specs were written for
 * (the demo clock of 13 oct 2026, 09:00 Colombian time). Specs that need another instant set their own with vi.setSystemTime.
 */
export const SUITE_NOW = new Date('2026-10-13T09:00:00-05:00');

vi.setSystemTime(SUITE_NOW);
beforeEach(() => { vi.setSystemTime(SUITE_NOW); });
