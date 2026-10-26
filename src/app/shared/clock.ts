import { Injectable } from '@angular/core';

/** The time the ports read (HU-COM-010 plan D-03): the demo build sets its clock (DD-PV3); no view reads Date.now(). */
@Injectable({ providedIn: 'root', useFactory: () => new SystemClock() })
export abstract class Clock { abstract now(): number; }

class SystemClock extends Clock { override now(): number { return Date.now(); } }

const TENANT_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;
/** The tenant's calendar day (America/Bogota, no daylight saving) as YYYY-MM-DD; views never use the browser's zone (pillar 2). */
export const tenantDay = (nowMs: number): string => new Date(nowMs + TENANT_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** An instant with any offset as the tenant's wall clock: the ISO text whose date and hour are those of America/Bogota. */
export const tenantWallTime = (iso: string): string => new Date(Date.parse(iso) + TENANT_UTC_OFFSET_MS).toISOString();
