import { describe, expect, it } from 'vitest';
import { eyebrowFor, greetingFor, partOfDay } from './greeting';

// Local time, no zone suffix: the greeting follows the clock of the device.
const at = (time: string) => new Date(`2026-10-09T${time}`);

describe('partOfDay', () => {
  it.each([
    ['04:59', 'evening'],
    ['05:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['17:59', 'afternoon'],
    ['18:00', 'evening'],
    ['23:59', 'evening'],
    ['00:00', 'evening'],
  ])('at %s it is the %s', (time, expected) => {
    expect(partOfDay(at(`${time}:00`))).toBe(expected);
  });
});

describe('greetingFor', () => {
  it('greets by the part of the day and the first name', () => {
    expect(greetingFor(at('09:00:00'), 'Ada')).toBe('Good morning, Ada.');
    expect(greetingFor(at('15:00:00'), 'Ada')).toBe('Good afternoon, Ada.');
    expect(greetingFor(at('21:00:00'), 'Ada')).toBe('Good evening, Ada.');
  });

  it.each([undefined, '', '   '])('leaves the name out when it is %j', name => {
    expect(greetingFor(at('09:00:00'), name)).toBe('Good morning.');
  });

  it('trims the name', () => {
    expect(greetingFor(at('09:00:00'), '  Ada ')).toBe('Good morning, Ada.');
  });
});

describe('eyebrowFor', () => {
  it('writes the weekday and the date in capitals, round a mid dot', () => {
    expect(eyebrowFor(at('09:00:00'))).toBe('FRIDAY · OCTOBER 9');
    expect(eyebrowFor(new Date('2026-01-01T09:00:00'))).toBe('THURSDAY · JANUARY 1');
  });
});
