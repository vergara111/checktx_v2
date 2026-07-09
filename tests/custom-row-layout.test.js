const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const photonOrigin = 'https://photon-sol.tinyastro.io/*';
assert.ok(
  manifest.content_scripts.some(script => script.matches.includes(photonOrigin)),
  'content script should run on Photon token pages'
);

assert.match(
  source,
  /function buildCustomBundleRow\(/,
  'custom row markup should be built by a dedicated helper'
);

assert.match(
  source,
  /row\.className\s*=\s*['"]flex flex-row flex-wrap justify-start grow-0 shrink-0 basis-full min-w-0 box-border -mx-4 sm:-mx-3 items-stretch gap-y-0['"]/,
  'the inserted element itself must carry the Solscan row layout classes'
);

assert.doesNotMatch(
  source,
  /newDiv\.innerHTML\s*=\s*`\s*<div class="flex flex-row flex-wrap/,
  'the Solscan row must not be nested inside an unstyled wrapper'
);

assert.doesNotMatch(
  source,
  /parentNode\.closest\("div"\)\.parentNode\.closest\("div"\)\.parentNode/,
  'insertion should not depend on a brittle parentNode.closest chain'
);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.id = '';
    this.innerText = '';
    this._className = '';
    this._innerHTML = '';
    this.style = {};
    this.classList = {
      contains: className => this._className.split(/\s+/).includes(className),
    };
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = value;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
  }

  appendChild(child) {
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentElement(position, element) {
    assert.equal(position, 'afterend');
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    element.parentElement = this.parentElement;
    element.parentNode = this.parentElement;
    siblings.splice(index + 1, 0, element);
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
    this.parentNode = null;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.head = new FakeElement('head');
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  addEventListener() {}

  querySelectorAll(selector) {
    assert.equal(selector, 'div');
    return this.collect(this.body).filter(element => element.tagName === 'DIV');
  }

  getElementById(id) {
    return this.collect(this.body).find(element => element.id === id) || null;
  }

  collect(root) {
    return [root, ...root.children.flatMap(child => this.collect(child))];
  }
}

function buildRuntime() {
  const document = new FakeDocument();
  const sandbox = {
    console,
    document,
    URL,
    setTimeout() {},
    clearTimeout() {},
    window: {
      location: { href: 'https://solscan.io/', pathname: '/' },
      addEventListener() {},
    },
    location: { href: 'https://solscan.io/' },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage() {},
      },
    },
    MutationObserver: class {
      observe() {}
    },
  };

  vm.runInNewContext(source, sandbox);
  return {
    document,
    extractSignatureFromLink: sandbox.extractSignatureFromLink,
    insertCustomDiv: sandbox.insertCustomDiv,
    showHoverNotification: sandbox.showHoverNotification,
  };
}

function appendDetailsRow(document, container, labelText) {
  const row = document.createElement('div');
  row.className = 'flex flex-row flex-wrap justify-start grow-0 shrink-0 basis-full min-w-0 box-border items-stretch gap-y-0';

  const labelColumn = document.createElement('div');
  labelColumn.className = 'max-w-24/24 md:max-w-6/24 flex-24/24 md:flex-6/24 block relative box-border my-0 px-4 sm:px-3';

  const label = document.createElement('div');
  label.innerText = labelText;

  const valueColumn = document.createElement('div');
  valueColumn.className = 'max-w-24/24 md:max-w-18/24 flex-24/24 md:flex-18/24 block relative box-border my-0 px-4 sm:px-3';

  container.appendChild(row);
  row.appendChild(labelColumn);
  labelColumn.appendChild(label);
  row.appendChild(valueColumn);

  return row;
}

{
  const { extractSignatureFromLink } = buildRuntime();
  const signature = '5bqRsj8x95NruTFAzG5z9KbixP7uFWhWzF94SGapdfZCMuLWFJfX47BMyjdu8agjQDwLxXC4yRDd';

  assert.equal(
    extractSignatureFromLink({
      href: `https://solscan.io/tx/${signature}?cluster=mainnet-beta#events`,
    }),
    signature,
    'Solscan tx signatures should be parsed without query strings or hashes'
  );
}

{
  const { document, showHoverNotification } = buildRuntime();
  const anchor = document.createElement('a');
  anchor.getBoundingClientRect = () => ({
    left: 100,
    top: 80,
    width: 24,
    height: 18,
    right: 124,
    bottom: 98,
  });

  showHoverNotification({ isBundle: false }, anchor);

  const notification = document.getElementById('jito-hover-notification');
  assert.ok(notification, 'hover notification should be created');
  assert.equal(notification.style.left, '112px');
  assert.equal(notification.style.top, '72px');
  assert.equal(notification.style.transform, 'translate(-50%, -100%)');
}

{
  const { document, insertCustomDiv } = buildRuntime();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const signerRow = appendDetailsRow(document, container, 'Signer');

  assert.equal(insertCustomDiv('#', 'Bundle ID (Tip)'), true);

  const insertedRow = document.getElementById('jito-bundle-row');
  assert.ok(insertedRow, 'custom bundle row should be inserted');
  assert.equal(insertedRow.parentElement, container);
  assert.equal(container.children.indexOf(insertedRow), container.children.indexOf(signerRow) + 1);
}

{
  const { document, insertCustomDiv } = buildRuntime();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const signerRow = appendDetailsRow(document, container, 'Signer');
  const personalLabelRow = appendDetailsRow(document, container, 'Personal Label');

  assert.equal(insertCustomDiv('#', 'Bundle ID (Tip)'), true);

  const insertedRow = document.getElementById('jito-bundle-row');
  assert.ok(insertedRow, 'custom bundle row should be inserted');
  assert.equal(
    container.children.indexOf(insertedRow),
    container.children.indexOf(personalLabelRow) + 1,
    'custom row should stay at the bottom of the details block when Personal Label exists'
  );
  assert.notEqual(
    container.children.indexOf(insertedRow),
    container.children.indexOf(signerRow) + 1,
    'custom row should not jump up after the Signer row when Personal Label exists'
  );
}

console.log('custom row layout contract ok');
