import { TextDecoder, TextEncoder } from 'util';

// The browser provides these APIs, but CRA's older jsdom environment does not.
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
