import assert from 'node:assert/strict';

const canvases = [];

class MockContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.textBaseline = 'alphabetic';
  }

  fillRect(x, y, width, height) {
    this.canvas.calls.push({ type: 'fillRect', fillStyle: this.fillStyle, x, y, width, height });
  }

  drawImage(...args) {
    this.canvas.calls.push({ type: 'drawImage', args });
  }

  fillText(text, x, y) {
    this.canvas.calls.push({ type: 'fillText', text, x, y });
  }

  measureText(text) {
    return { width: String(text).length * 8 };
  }
}

class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.calls = [];
    canvases.push(this);
  }

  getContext() {
    return new MockContext(this);
  }

  toBlob(callback, mimeType) {
    const payload = JSON.stringify({
      width: this.width,
      height: this.height,
      mimeType,
      calls: this.calls
    });
    callback(new Blob([payload], { type: mimeType }));
  }
}

globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return new MockCanvas();
  }
};

globalThis.Image = class {
  set src(value) {
    const match = String(value).match(/(\d+)x(\d+)/);
    this.width = Number(match?.[1] || 50);
    this.height = Number(match?.[2] || 100);
    queueMicrotask(() => this.onload?.());
  }
};

globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.text().then((text) => {
      this.result = `data:${blob.type};base64,${Buffer.from(text).toString('base64')}`;
      this.onloadend?.();
    }).catch(() => this.onerror?.());
  }
};

const { stitchImages } = await import('../offscreen/stitch.js');

function decodeResult(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

async function stitch(options = {}, segments = [
  { dataUrl: 'mock:50x100', actualScrollY: 0, isLastFrame: false },
  { dataUrl: 'mock:50x100', actualScrollY: 100, isLastFrame: true }
]) {
  canvases.length = 0;
  const dataUrl = await stitchImages(segments, {
    scrollHeight: 200,
    viewportHeight: 100,
    viewportWidth: 50,
    devicePixelRatio: 1
  }, {
    format: 'png',
    metadataEnabled: false,
    ...options
  });
  return decodeResult(dataUrl);
}

const plain = await stitch();
assert.equal(plain.width, 50);
assert.equal(plain.height, 200);
assert.equal(plain.calls.filter((call) => call.type === 'drawImage').length, 2);

const top = await stitch({
  metadataEnabled: true,
  metadataPosition: 'top',
  metadataFields: 'keyword',
  metadataLabelsEnabled: false,
  metadataContext: { keyword: 'x' },
  metadataFontSize: 10,
  metadataPadding: 5,
  metadataGap: 0,
  metadataTextColor: '#ffffff',
  metadataBackgroundColor: '#000000'
});
assert.equal(top.height, 224);
assert.ok(top.calls.some((call) => call.type === 'fillRect' && call.fillStyle === '#000000' && call.y === 0 && call.height === 24));
assert.equal(top.calls.find((call) => call.type === 'drawImage').args[2], 24);

const bottom = await stitch({
  metadataEnabled: true,
  metadataPosition: 'bottom',
  metadataFields: 'keyword',
  metadataLabelsEnabled: false,
  metadataContext: { keyword: 'x' },
  metadataFontSize: 10,
  metadataPadding: 5,
  metadataGap: 0,
  metadataBackgroundColor: '#000000'
});
assert.equal(bottom.height, 224);
assert.ok(bottom.calls.some((call) => call.type === 'fillRect' && call.fillStyle === '#000000' && call.y === 200 && call.height === 24));

const overlap = await stitch({}, [
  { dataUrl: 'mock:50x100', actualScrollY: 0, isLastFrame: false },
  { dataUrl: 'mock:50x100', actualScrollY: 80, isLastFrame: true }
]);
const overlapDraw = overlap.calls.filter((call) => call.type === 'drawImage').at(-1);
assert.deepEqual(overlapDraw.args.slice(1), [0, 20, 50, 80, 0, 100, 50, 80]);

console.log('Stitch tests passed');
