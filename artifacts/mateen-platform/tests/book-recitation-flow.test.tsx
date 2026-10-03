import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import LiveRecitation from '../src/components/mateen/live-recitation';

const dom = new JSDOM('<html><body></body></html>', {url:'https://test.invalid'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(window,'isSecureContext',{value:true});
const { createRoot } = await import('react-dom/client');
class Recognition {
  static latest:Recognition;
  onresult:((e:unknown) => void)|null=null;
  onerror:((e:unknown) => void)|null=null;
  onend:(() => void)|null=null;
  aborted=false;
  constructor() { Recognition.latest=this; }
  start() {}
  abort() { this.aborted=true; }
  emit() { this.onresult?.({results:[{isFinal:true,0:{transcript:'إنما'}}]}); }
}
Object.assign(window,{SpeechRecognition:Recognition});
after(() => dom.window.close());

test('reading first, explicit start, clipped reveal and return after manual reveal without microphone leak or lockout', async () => {
  const container=document.createElement('div');
  document.body.appendChild(container);
  const root=createRoot(container);
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async () => { throw new Error('Practice must not submit audio or grades'); };
  const button=(id:string) => {
    const b=container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    assert.ok(b);return b;
  };
  try {
    await act(async () => root.render(<LiveRecitation text="إنما الأعمال بالنيات" fontSize={30} hadithId={1} />));
    assert.ok(container.querySelector('[data-testid="book-reader"]'));
    assert.equal(container.querySelector('[data-testid="scanned-pages"]'),null);
    assert.equal(button('button-live-start').disabled,false);
    assert.equal(Recognition.latest,undefined);
    await act(async () => button('button-live-start').click());
    const checkbox=container.querySelector<HTMLInputElement>('[data-testid="checkbox-live-consent"]')!;
    await act(async () => checkbox.click());
    await act(async () => button('button-consent-confirm').click());
    const first=Recognition.latest;
    assert.ok(first);
    assert.equal(container.querySelector('[data-testid="book-reader"]'),null);
    assert.ok(container.querySelector('[data-testid="scanned-pages"]'));
    assert.equal(container.querySelector('[data-testid="scan-image"]'),null);
    await act(async () => first.emit());
    assert.equal(container.querySelectorAll('[data-testid="scan-clip-rect"]').length,1);
    await act(async () => button('button-live-reveal').click());
    assert.equal(first.aborted,true);
    assert.ok(container.querySelector('[data-testid="text-manual-reveal"]'));
    await act(async () => button('button-back-to-reading').click());
    assert.ok(container.querySelector('[data-testid="book-reader"]'));
    assert.equal(container.querySelector('[data-testid="text-manual-reveal"]'),null);
    assert.equal(button('button-live-start').disabled,false);
    await act(async () => button('button-live-start').click());
    await act(async () => container.querySelector<HTMLInputElement>('[data-testid="checkbox-live-consent"]')!.click());
    await act(async () => button('button-consent-confirm').click());
    assert.notEqual(Recognition.latest,first);
    assert.equal(container.querySelector('[data-testid="scan-image"]'),null);
    const second=Recognition.latest;
    await act(async () => button('button-back-to-reading').click());
    assert.equal(second.aborted,true);
    assert.ok(container.querySelector('[data-testid="book-reader"]'));
  } finally {
    await act(async () => root.unmount());
    container.remove();globalThis.fetch=oldFetch;
  }
});