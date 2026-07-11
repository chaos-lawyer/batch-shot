import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createMockElement({
  tag = 'a',
  id = '',
  className = '',
  attrs = {},
  innerText = '',
  rect = { width: 100, height: 30 },
  visibility = 'visible',
  display = 'block'
}) {
  const el = {
    localName: tag,
    id,
    className,
    innerText,
    textContent: innerText,
    attributes: attrs,
    parentElement: null,
    getAttribute(name) {
      if (name === 'class') return className;
      if (name === 'id') return id;
      return attrs[name] || null;
    },
    getBoundingClientRect() {
      return rect;
    },
    classList: {
      contains: (name) => className.split(' ').map(c => c.trim()).includes(name)
    },
    style: {},
    computedStyle: {
      visibility,
      display,
      pointerEvents: 'auto'
    }
  };
  return el;
}

class Element {}

const activePageEl = createMockElement({
  tag: 'span',
  className: 'active',
  innerText: '1'
});
Object.setPrototypeOf(activePageEl, Element.prototype);

const nextButtonEl = createMockElement({
  tag: 'a',
  className: 'pageButton',
  attrs: { value: '2' },
  innerText: '下一页'
});
Object.setPrototypeOf(nextButtonEl, Element.prototype);

const disabledButtonEl = createMockElement({
  tag: 'a',
  className: 'pageButton disabled',
  innerText: '下一页',
  visibility: 'hidden'
});
Object.setPrototypeOf(disabledButtonEl, Element.prototype);

const randomButtonEl = createMockElement({
  tag: 'a',
  innerText: '首页'
});
Object.setPrototypeOf(randomButtonEl, Element.prototype);

const baiduNextButtonEl = createMockElement({
  tag: 'a',
  className: 'n next_d-g2R',
  innerText: '下一页 >'
});
Object.setPrototypeOf(baiduNextButtonEl, Element.prototype);

const mockElements = [activePageEl, nextButtonEl, disabledButtonEl, randomButtonEl, baiduNextButtonEl];

mockElements.forEach((el) => {
  el.parentElement = {
    children: mockElements
  };
});

const context = {
  Element,
  window: {
    location: { href: 'http://localhost/test' },
    getComputedStyle: (element) => element.computedStyle
  },
  document: {
    body: { localName: 'body' },
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return mockElements.filter(el => el.id === id);
      }
      if (selector === '.active') {
        return mockElements.filter(el => el.className.includes('active'));
      }
      // Return all candidates for pagination detect queries
      return mockElements.filter(el => ['a', 'button'].includes(el.localName));
    },
    querySelector(selector) {
      if (selector === '.active, .current, [aria-current="page"], .page-current') {
        return activePageEl;
      }
      return null;
    }
  }
};

vm.createContext(context);

// Expose mock elements to VM context
context.activePageEl = activePageEl;
context.nextButtonEl = nextButtonEl;
context.disabledButtonEl = disabledButtonEl;
context.randomButtonEl = randomButtonEl;
context.baiduNextButtonEl = baiduNextButtonEl;

// Load builder and pagination scripts
vm.runInContext(fs.readFileSync(new URL('../content/selector-builder.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../content/pagination.js', import.meta.url), 'utf8'), context);

// Test detectNextPage
const result = vm.runInContext('detectNextPage()', context);

assert.ok(result.ok, 'Should successfully detect next page element');
assert.equal(result.confidence, 'high', 'Should detect next page with high confidence');
assert.equal(result.text, '下一页', 'Detected text should be 下一页');

// Test Baidu-style next page link with generated class and arrow text
const baiduOnlyContext = {
  ...context,
  document: {
    ...context.document,
    querySelectorAll(selector) {
      if (selector === '.active') {
        return [activePageEl];
      }
      return [activePageEl, baiduNextButtonEl];
    }
  }
};
vm.createContext(baiduOnlyContext);
vm.runInContext(fs.readFileSync(new URL('../content/selector-builder.js', import.meta.url), 'utf8'), baiduOnlyContext);
vm.runInContext(fs.readFileSync(new URL('../content/pagination.js', import.meta.url), 'utf8'), baiduOnlyContext);
const baiduResult = vm.runInContext('detectNextPage()', baiduOnlyContext);
assert.ok(baiduResult.ok, 'Should detect Baidu-style next page link');
assert.equal(baiduResult.text, '下一页 >', 'Detected Baidu text should include 下一页');

// Test pure function getElementScore directly
const scoreNormalNext = vm.runInContext('getElementScore(nextButtonEl, 1)', context);
assert.ok(scoreNormalNext > 50, 'Standard next page button should have a high score');

const scoreDisabled = vm.runInContext('getElementScore(disabledButtonEl, 1)', context);
assert.ok(scoreDisabled > 0, 'Disabled element can still have a raw score computed');

const scoreBaidu = vm.runInContext('getElementScore(baiduNextButtonEl, 1)', context);
assert.ok(scoreBaidu > 30, 'Baidu next page button should score appropriately');

const scoreRandom = vm.runInContext('getElementScore(randomButtonEl, 1)', context);
assert.equal(scoreRandom, 0, 'Non-next page button should score 0');

console.log('Pagination detection tests passed!');
