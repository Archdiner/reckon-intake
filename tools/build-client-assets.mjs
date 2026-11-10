#!/usr/bin/env node
// Regenerates worker/client-assets.js (the served installer text plus the
// base64 client zip) from install.sh and client/. Store-only zip, fixed
// timestamps, so output is deterministic for a given input tree. The deployed
// bundle's pinned SHA-256 comes from the deployment pipeline; compare unpacked
// contents when verifying, not the archive bytes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'client');

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const names = fs.readdirSync(clientDir).filter((n) => fs.statSync(path.join(clientDir, n)).isFile()).sort();
const files = names.map((n) => ({ name: 'paxel-intake/' + n, data: fs.readFileSync(path.join(clientDir, n)) }));

const chunks = [];
const central = [];
let offset = 0;
for (const f of files) {
  const nameBytes = Buffer.from(f.name, 'utf8');
  const crc = crc32(f.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);          // version needed
  local.writeUInt16LE(0x0800, 6);      // UTF-8 flag
  local.writeUInt16LE(0, 8);           // store
  local.writeUInt16LE(0, 10);          // time
  local.writeUInt16LE(0x21, 12);       // 1980-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(f.data.length, 18);
  local.writeUInt32LE(f.data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBytes, f.data);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(0, 10);
  cen.writeUInt16LE(0, 12);
  cen.writeUInt16LE(0x21, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(f.data.length, 20);
  cen.writeUInt32LE(f.data.length, 24);
  cen.writeUInt16LE(nameBytes.length, 28);
  cen.writeUInt32LE(0, 38);            // external attrs
  cen.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([cen, nameBytes]));
  offset += 30 + nameBytes.length + f.data.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...chunks, centralBuf, end]);

const installer = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
const out = 'export const installer=' + JSON.stringify(installer) + ',\nclientBase64=' + JSON.stringify(zip.toString('base64')) + ';\n';
fs.writeFileSync(path.join(root, 'worker', 'client-assets.js'), out);
console.log('wrote worker/client-assets.js:', files.length, 'client files,', zip.length, 'zip bytes');
