import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScannedPages } from '../src/components/mateen/scanned-pages';
import { regionVisible, scannedGate } from '../src/lib/scanned-pages';

const text = 'إنما الأعمال بالنيات';
const data = { status: 'available' as const, message: '', text,
  pages: [{ page: 7, width: 1000, height: 1400, imageUrl: '/api/mateen/recitation-page-images/7' }, { page: 8, width: 1000, height: 1400, imageUrl: '/api/mateen/recitation-page-images/8' }],
  regions: [{ page: 7, wordIndices: [0, 1], x: 10, y: 20, width: 300, height: 60 }, { page: 7, wordIndices: [2], x: 400, y: 20, width: 100, height: 60 }],
  unmappedIndices: [] as number[] };
const q = (d: unknown) => ({ enabled: true, isLoading: false, isError: false, data: d as typeof data });

test('gate blocks pending, mismatch and invalid data', () => {
  assert.equal(scannedGate(q({ ...data, status: 'rights_pending' }), text, 3).kind, 'rights_pending');
  assert.equal(scannedGate(q({ ...data, status: 'mapping_pending' }), text, 3).kind, 'mapping_pending');
  assert.equal(scannedGate(q({ ...data, text: text + ' ' }), text, 3).kind, 'mismatch');
  assert.equal(scannedGate(q({ ...data, regions: [{ ...data.regions[0], wordIndices: [9] }] }), text, 3).kind, 'invalid');
  assert.equal(scannedGate({ enabled: true, isLoading: true, isError: false }, text, 3).kind, 'loading');
  assert.equal(scannedGate({ enabled: false, isLoading: false, isError: false }, text, 3).kind, 'idle');
  assert.equal(scannedGate(q(data), text, 3).kind, 'ready');
});

test('region requires all words finally revealed', () => {
  assert.equal(regionVisible(data.regions[0], [true, false, false]), false);
  assert.equal(regionVisible(data.regions[0], [true, true, false]), true);
});

test('only the original title is visible before recitation and invalid title geometry is rejected', () => {
  const headed={...data,heading:{page:7,x:100,y:80,width:200,height:50}};
  assert.equal(scannedGate(q(headed),text,3).kind,'ready');
  const html=renderToStaticMarkup(<ScannedPages data={headed} revealed={[false,false,false]} onImageError={()=>{}} />);
  assert.ok(html.includes('scan-heading-rect'));
  assert.ok(html.includes('scan-image'));
  assert.ok(!html.includes('scan-clip-rect'));
  assert.equal(scannedGate(q({...headed,heading:{...headed.heading,x:999}}),text,3).kind,'invalid');
  assert.equal(scannedGate(q({...headed,heading:{...headed.heading,width:NaN}}),text,3).kind,'invalid');
  const other=renderToStaticMarkup(<ScannedPages data={{...headed,heading:{...headed.heading,page:8}}} revealed={[false,false,false]} onImageError={()=>{}} />);
  assert.ok(!other.includes('scan-image'));
});

test('off-page and non-finite crop geometry cannot expose the image', () => {
  for (const patch of [{x: -1}, {y: -1}, {width: 99999}, {height: Infinity}, {x: NaN}]) {
    assert.equal(scannedGate(q({...data, regions: [{...data.regions[0], ...patch}]}), text, 3).kind, 'invalid');
  }
});

test('blank/reset page requests no image; partial reveal clips only complete regions', () => {
  const blank = renderToStaticMarkup(<ScannedPages data={data} revealed={[false, false, false]} onImageError={() => {}} />);
  assert.ok(!blank.includes('recitation-page-images'));
  assert.ok(!blank.includes('<image'));
  const part = renderToStaticMarkup(<ScannedPages data={data} revealed={[true, false, true]} onImageError={() => {}} />);
  assert.equal((part.match(/scan-clip-rect/g) ?? []).length, 1);
  assert.ok(part.includes('x="400"') && !part.includes('x="10"'));
  assert.ok(/<image[^>]*clip-path="url\(#scan-clip-7\)"/.test(part));
  assert.ok(part.includes('صفحة ١ من ٢') || part.includes('من'));
});
