import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createElement({
  tag = 'div',
  position = 'static',
  backgroundImage = 'none',
  zIndex = 'auto',
  pointerEvents = 'auto',
  rect
}) {
  return {
    style: {
      visibility: '',
      transition: '',
      scrollBehavior: ''
    },
    computedStyle: {
      position,
      backgroundImage,
      zIndex,
      pointerEvents
    },
    rect,
    matches: (selector) => selector.split(',').map((part) => part.trim()).includes(tag),
    querySelector: () => null,
    getBoundingClientRect() {
      return this.rect;
    }
  };
}

const backgroundLayer = createElement({
  position: 'fixed',
  backgroundImage: 'url("skin.jpg")',
  zIndex: '-1',
  rect: { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }
});
const fixedToolbar = createElement({
  position: 'fixed',
  backgroundImage: 'none',
  zIndex: '10',
  rect: { left: 0, top: 0, right: 1200, bottom: 64, width: 1200, height: 64 }
});
const foregroundWatermarkCanvas = createElement({
  tag: 'canvas',
  position: 'fixed',
  zIndex: '999999',
  pointerEvents: 'none',
  rect: { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }
});
const normalContent = createElement({
  rect: { left: 0, top: 120, right: 400, bottom: 240, width: 400, height: 120 }
});
const scrollbarStyle = {
  dataset: {},
  textContent: '',
  removeCalled: false,
  remove() {
    this.removeCalled = true;
  }
};
const elements = [backgroundLayer, fixedToolbar, foregroundWatermarkCanvas, normalContent];
const documentElement = {
  clientHeight: 800,
  clientWidth: 1200,
  offsetHeight: 800,
  offsetWidth: 1200,
  scrollHeight: 800,
  scrollWidth: 1200,
  style: { scrollBehavior: 'smooth' },
  appendChild: (element) => {
    assert.equal(element, scrollbarStyle);
  }
};
const body = {
  offsetHeight: 800,
  offsetWidth: 1200,
  scrollHeight: 800,
  scrollWidth: 1200
};
const context = {
  window: {
    innerHeight: 800,
    innerWidth: 1200,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    getComputedStyle: (element) => element.computedStyle,
    scrollTo: () => {}
  },
  document: {
    body,
    documentElement,
    createElement: (tag) => {
      assert.equal(tag, 'style');
      return scrollbarStyle;
    },
    querySelectorAll: (selector) => {
      assert.ok(['*', 'body *'].includes(selector));
      return elements;
    }
  },
  requestAnimationFrame: (callback) => callback()
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../content/capture-page.js', import.meta.url), 'utf8'), context);

const metrics = vm.runInContext('preparePage()', context);

assert.equal(metrics.scrollHeight, 800);
assert.equal(metrics.scrollWidth, 1200);
assert.equal(metrics.viewportHeight, 800);
assert.equal(metrics.viewportWidth, 1200);
assert.equal(metrics.devicePixelRatio, 1);
assert.equal(backgroundLayer.style.visibility, '', 'Viewport background layers should stay visible');
assert.equal(fixedToolbar.style.visibility, 'hidden', 'Regular fixed elements should still be hidden');
assert.equal(foregroundWatermarkCanvas.style.visibility, 'hidden', 'Foreground watermark canvases should be hidden');
assert.equal(normalContent.style.visibility, '', 'Non-fixed content should not be hidden');

vm.runInContext('cleanupPage()', context);

assert.equal(documentElement.style.scrollBehavior, 'smooth');
assert.equal(scrollbarStyle.removeCalled, true);
assert.equal(fixedToolbar.style.visibility, '', 'Cleanup should restore hidden fixed elements');

console.log('Capture page preparation tests passed!');
