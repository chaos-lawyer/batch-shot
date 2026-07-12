import assert from 'assert';
import fs from 'fs';
import vm from 'vm';

class MockElement {
  constructor({ tag = 'span', id = '', className = '', attributes = {}, parent = null } = {}) {
    this.tag = tag;
    this.id = id;
    this.className = className;
    this.attributes = attributes;
    this.parentElement = parent;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (selector.includes('button') && ['button', 'a'].includes(current.tag)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  matches(selector) {
    return selector.split(',').map((part) => part.trim()).includes(this.tag);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }
}

const body = new MockElement({ tag: 'body' });
const context = vm.createContext({
  Element: MockElement,
  document: { body },
  chrome: { i18n: { getMessage: () => '' } }
});

vm.runInContext(fs.readFileSync(new URL('../content/button-picker.js', import.meta.url), 'utf8'), context);

const vueSearchSpan = new MockElement({ className: 'searchBtn', parent: body });
const vueSearchResult = vm.runInContext('closestSubmitElement(target)', vm.createContext({
  ...context,
  target: vueSearchSpan
}));
assert.strictEqual(vueSearchResult, vueSearchSpan, 'Should recognize a Vue span.searchBtn as a submit control');

const customButton = new MockElement({ tag: 'div', className: 'cs_otherbutton2', parent: body });
const childIcon = new MockElement({ tag: 'span', parent: customButton });
context.target = childIcon;
assert.strictEqual(
  vm.runInContext('closestSubmitElement(target)', context),
  customButton,
  'Should walk up to a custom button ancestor'
);

const ordinarySpan = new MockElement({ parent: body });
context.target = ordinarySpan;
assert.strictEqual(
  vm.runInContext('closestSubmitElement(target)', context),
  null,
  'Should not treat an arbitrary span as a submit control'
);

console.log('Button picker tests passed!');
