import { Injectable } from '@angular/core';

/** The time the ports read (HU-COM-010 plan D-03): the demo build sets its clock (DD-PV3); no view reads Date.now(). */
@Injectable({ providedIn: 'root', useFactory: () => new SystemClock() })
export abstract class Clock { abstract now(): number; }

class SystemClock extends Clock { override now(): number { return Date.now(); } }
