import { expect, it } from 'vitest';
import { readLocalLibrary, STORAGE_KEY, writeLocalLibrary } from './storage.js';

const session = { id: 'test', imageName: 'synthetic.png', photo: 'data:image/png;base64,AAAA', boxes: [], pending: [[0.1, 0.2]] };
it('preserves photo drafts and pending corners across reloads', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeLocalLibrary([session], session.id, storage);
  expect(readLocalLibrary(storage)).toEqual({ sessions: [session], currentId: session.id, error: '' });
  writeLocalLibrary([], '', storage);
  expect(JSON.parse(values.get(STORAGE_KEY)).sessions).toEqual([]);
});
it('reports corrupt/blocked storage and preserves old data on quota failure', () => {
  expect(readLocalLibrary({ getItem: () => '{bad' }).error).toContain('archivio locale');
  const previous = JSON.stringify({ version: 1, currentId: 'test', sessions: [session] });
  const storage = { getItem: () => previous, setItem: () => { throw new Error('QuotaExceededError'); } };
  expect(() => writeLocalLibrary([session, { ...session, id: 'next' }], 'next', storage)).toThrow('spazio esaurito');
  expect(readLocalLibrary(storage).sessions).toEqual([session]);
});

it('continues to read old local sessions with optional dimensions', () => {
  const legacy = { ...session, width: '13', height: '7', boxes: [{ widthCm: 13, heightCm: 7, points: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.1, 0.2]] }] };
  const storage = { getItem: () => JSON.stringify({ version: 1, currentId: 'test', sessions: [legacy] }) };
  expect(readLocalLibrary(storage).sessions).toEqual([legacy]);
});

it('preserves a calibrated marker locally and rejects corrupt marker data', () => {
  const marker = { dictionary: 'ARUCO_MIP_36h12', id: 7, placement: 'plate-bottom-left', sourceCorners: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]] };
  let raw;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  writeLocalLibrary([{ ...session, marker }], 'test', storage);
  expect(readLocalLibrary(storage).sessions[0].marker).toEqual(marker);
  expect(() => writeLocalLibrary([{ ...session, marker: { ...marker, id: 250 } }], 'test', storage)).toThrow('non valida');
});
