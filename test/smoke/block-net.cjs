// Preloaded with `node --require`: records and blocks every outbound network primitive.
'use strict';
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');

const attempts = [];
globalThis.__netAttempts = attempts;
function blocked(kind, detail) {
  attempts.push(`${kind} ${detail}`);
  return new Error(`network blocked by smoke test: ${kind} ${detail}`);
}

net.Socket.prototype.connect = function (...args) {
  const o = args[0];
  throw blocked('net.connect', typeof o === 'object' && o ? `${o.host ?? o.path}:${o.port ?? ''}` : String(o));
};
tls.connect = (...args) => { const o = typeof args[0] === 'object' && args[0] ? args[0] : { host: args[1], port: args[0] }; throw blocked('tls.connect', `${o.host ?? o.servername}:${o.port}`); };
dns.lookup = (host, ...rest) => { const cb = rest.pop(); process.nextTick(cb, blocked('dns.lookup', host)); };
dns.promises.lookup = async (host) => { throw blocked('dns.promises.lookup', host); };
globalThis.fetch = async (input) => { throw blocked('fetch', String(input?.url ?? input)); };

process.on('exit', (code) => {
  if (attempts.length) {
    console.error(`NETWORK ATTEMPTS (${attempts.length}):\n  ${attempts.join('\n  ')}`);
    process.exitCode = 1;
  } else if (code === 0) {
    console.log('network attempts: 0');
  }
});
