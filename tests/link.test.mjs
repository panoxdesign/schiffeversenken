// Einladungslink und Server-Adresse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteLink, takeJoinCode, serverWsUrl, serverHealthUrl } from '../src/net/link.js';

test('Einladungslink: Client-URL mit ?join=CODE, alte Parameter weg', () => {
  assert.equal(inviteLink('K7QX', 'https://freibeuter.example/spiel/?fps#x'), 'https://freibeuter.example/spiel/?join=K7QX');
});

test('Code aus der Adresse lesen und entfernen', () => {
  const calls = [];
  const history = { state: null, replaceState: (s, t, url) => calls.push(url) };
  assert.equal(takeJoinCode({ href: 'https://f.example/?quality=low&join=k7qx#a' }, history), 'k7qx');
  assert.deepEqual(calls, ['/?quality=low#a']);
  assert.equal(takeJoinCode({ href: 'https://f.example/' }, history), null);
  assert.equal(calls.length, 1, 'ohne Code bleibt die Adresse unverändert');
});

test('WebSocket-Adresse: Server-URL aus der Umgebung oder derselbe Host', () => {
  assert.equal(serverWsUrl('https://hafen.onrender.com'), 'wss://hafen.onrender.com/ws');
  assert.equal(serverWsUrl(undefined, { href: 'http://localhost:5173/?join=AB' }), 'ws://localhost:5173/ws');
  assert.equal(serverWsUrl('', { href: 'https://f.example/' }), 'wss://f.example/ws');
});

test('Weck-Ping-Adresse: /health beim Server bzw. auf demselben Host', () => {
  assert.equal(serverHealthUrl('https://hafen.onrender.com/'), 'https://hafen.onrender.com/health');
  assert.equal(serverHealthUrl(undefined, { href: 'http://localhost:5173/spiel?x=1' }), 'http://localhost:5173/health');
});
