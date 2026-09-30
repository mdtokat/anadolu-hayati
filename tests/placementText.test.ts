import { describe, expect, it } from 'vitest';
import { CLOCK, FIRE } from '../src/config';
import type { ConfirmFailure, Ghost } from '../src/placement/PlacementController';
import {
  aimPrompt,
  fuelToast,
  gameHours,
  placeFailureText,
  placedToast,
  tendPrompt,
  toggleToast,
} from '../src/placement/promptText';
import type { TendOffer } from '../src/placement/tend';

const ghost = (over: Partial<Ghost> = {}): Ghost => ({
  kind: 'campfire',
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  valid: true,
  reason: null,
  ...over,
});

describe('yerleştirme metinleri', () => {
  it('her başarısızlık nedeninin metni tanımlı; oyuncuya gösterilenler boş değil', () => {
    const shown: ConfirmFailure[] = [
      'too_far',
      'in_sea',
      'too_steep',
      'near_water',
      'too_close',
      'no_target',
      'no_item',
    ];
    for (const reason of shown) expect(placeFailureText(reason).length, reason).toBeGreaterThan(0);
    expect(placeFailureText('not_aiming')).toBe('');
    expect(placeFailureText('dead')).toBe('');
  });

  it('hayalet ipucu: geçerliyse kur/iptal tuşları, değilse neden', () => {
    expect(aimPrompt(ghost())).toBe('Sol tık: Kamp Ateşi kur · C: iptal');
    expect(aimPrompt(ghost({ kind: 'lean_to' }))).toBe('Sol tık: Sundurma kur · G: iptal');
    expect(aimPrompt(ghost({ valid: false, reason: 'too_steep' }))).toBe('Zemin çok dik');
  });

  it('toggleToast yalnızca eşya yokluğunda bildirir', () => {
    expect(toggleToast('no_item', 'campfire')).toBe('Envanterinde Kamp Ateşi yok');
    expect(toggleToast('started', 'campfire')).toBeNull();
    expect(toggleToast('cancelled', 'campfire')).toBeNull();
    expect(toggleToast('dead', 'campfire')).toBeNull();
    expect(placedToast('lean_to')).toBe('Sundurma kuruldu');
  });

  it('yakıt süresi oyun saatine çevrilir ve virgüllü yazılır', () => {
    expect(gameHours(CLOCK.dayLengthSeconds / 24)).toBe(1);
    expect(fuelToast(FIRE.fuel.stick)).toBe(
      `Ateş uzadı: +${(FIRE.fuel.stick / (CLOCK.dayLengthSeconds / 24)).toFixed(1).replace('.', ',')} sa`,
    );
    expect(fuelToast(90)).toContain(',');
  });

  it('ateş ipucu: hazırsa eşya adıyla, yakıt yoksa uyarı, depo doluysa sessiz', () => {
    const offer = (over: Partial<TendOffer>): TendOffer => ({
      status: 'ready',
      fireId: 1,
      item: 'stick',
      seconds: 90,
      ...over,
    });
    expect(tendPrompt(offer({}))).toBe('E (basılı tut): Ateşe dal at');
    expect(tendPrompt(offer({ item: 'log' }))).toBe('E (basılı tut): Ateşe kütük at');
    expect(tendPrompt(offer({ status: 'noFuel', item: null }))).toBe(
      'Ateşe atacak dal veya kütük yok',
    );
    expect(tendPrompt(offer({ status: 'full', item: null }))).toBeNull();
  });
});
