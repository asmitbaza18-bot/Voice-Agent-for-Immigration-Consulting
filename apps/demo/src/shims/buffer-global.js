// Browser-only: a global Buffer for the packages, with the 'base64url' encoding Node has.
import { Buffer as B } from 'buffer';

const toUrl = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = (s) => s.replace(/-/g, '+').replace(/_/g, '/');
const from = B.from;
B.from = function (value, enc, len) {
  if (enc === 'base64url' && typeof value === 'string') return from.call(B, fromUrl(value), 'base64');
  return from.call(B, value, enc, len);
};
const toString = B.prototype.toString;
B.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toUrl(toString.call(this, 'base64'));
  return toString.call(this, enc, ...rest);
};
globalThis.Buffer = B;
export { B as Buffer };
