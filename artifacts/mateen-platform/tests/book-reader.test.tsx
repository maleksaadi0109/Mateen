import './exam-book.test';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookReader } from '../src/components/mateen/book-reader';
import type { NawawiBook } from '@workspace/api-client-react';

const book: NawawiBook = {
  edition: 'دار السلام', sourceUrl: 'https://islamhouse.com',
  pages: Array.from({length:32}, (_,i) => ({
    page:i+1,width:652,height:964,imageUrl:`/api/mateen/recitation-page-images/${i+1}`,
  })),
  hadithPages: [{hadithId:1,firstPage:3,lastPage:3},{hadithId:2,firstPage:4,lastPage:5}],
};
test('entry displays the selected hadith original page visibly, not clipped or blank', () => {
  const html = renderToStaticMarkup(<BookReader book={book} isLoading={false} isError={false} onRetry={() => {}} hadithId={1} />);
  assert.ok(html.includes('<img') && html.includes('recitation-page-images/3'));
  assert.ok(!html.includes('clipPath') && !html.includes('scan-clip'));
  assert.ok(html.includes('button-book-prev') && html.includes('button-book-next'));
});
test('selecting another hadith locates its own source page', () => {
  const html = renderToStaticMarkup(<BookReader book={book} isLoading={false} isError={false} onRetry={() => {}} hadithId={2} />);
  assert.ok(html.includes('recitation-page-images/4'));
  assert.ok(!html.includes('recitation-page-images/3'));
});
test('load errors and loading are explicit and do not request original image URLs', () => {
  for (const props of [{isLoading:true,isError:false},{isLoading:false,isError:true}]) {
    const html = renderToStaticMarkup(<BookReader {...props} onRetry={() => {}} hadithId={1} />);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes(props.isError ? 'button-book-retry' : 'book-loading'));
  }
});