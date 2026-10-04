import { JSDOM } from 'jsdom';

// Preload before Radix/React DOM so their browser capability checks see a DOM.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/student/settings' });
globalThis.preferencesTestDOM = dom;
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node, NodeFilter: dom.window.NodeFilter,
  CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});