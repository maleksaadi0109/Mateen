import { JSDOM } from 'jsdom';

// Browser capability detection must happen after the DOM, even through Clerk imports.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://geometry-test.invalid' });
globalThis.geometryTestDOM = dom;
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
