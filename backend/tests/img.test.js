const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBingHtml } = require('../src/services/imageSuggest');

const SAMPLE = `<div class="iusc" m="{&quot;sid&quot;:&quot;x&quot;,&quot;purl&quot;:&quot;https://www.flipkart.com/pen/p/a&quot;,&quot;murl&quot;:&quot;https://rukminim1.flixcart.com/image/abc/pen.jpeg&quot;,&quot;t&quot;:&quot;Reynolds Pen Blue&quot;,&quot;mid&quot;:&quot;1&quot;}"></div><div class="iusc" m="{&quot;purl&quot;:&quot;https://example.com/b&quot;,&quot;murl&quot;:&quot;not-a-url&quot;,&quot;t&quot;:&quot;Bad&quot;,&quot;mid&quot;:&quot;2&quot;}"></div>`;

test('parseBingHtml extracts valid candidates only', () => {
  const out = parseBingHtml(SAMPLE);
  assert.equal(out.length, 1);
  assert.equal(out[0].murl, 'https://rukminim1.flixcart.com/image/abc/pen.jpeg');
  assert.equal(out[0].title, 'Reynolds Pen Blue');
});

test('parseBingHtml empty on garbage', () => {
  assert.deepEqual(parseBingHtml(''), []);
  assert.deepEqual(parseBingHtml('<html>nope</html>'), []);
});
