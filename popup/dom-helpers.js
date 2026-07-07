const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  rename: [
    ['path', { d: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' }]
  ],
  delete: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['line', { x1: '10', y1: '11', x2: '10', y2: '17' }],
    ['line', { x1: '14', y1: '11', x2: '14', y2: '17' }]
  ],
  pin: [
    ['line', { x1: '12', y1: '17', x2: '12', y2: '22' }],
    ['path', { d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z' }]
  ],
  'pin-filled': [
    ['line', { x1: '12', y1: '17', x2: '12', y2: '22' }],
    ['path', { d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z', fill: 'currentColor' }]
  ],
  'grip-vertical': [
    ['circle', { cx: '9', cy: '12', r: '1' }],
    ['circle', { cx: '9', cy: '5', r: '1' }],
    ['circle', { cx: '9', cy: '19', r: '1' }],
    ['circle', { cx: '15', cy: '12', r: '1' }],
    ['circle', { cx: '15', cy: '5', r: '1' }],
    ['circle', { cx: '15', cy: '19', r: '1' }]
  ],
  play: [
    ['polygon', { points: '5 3 19 12 5 21 5 3' }]
  ],
  pause: [
    ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
    ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }]
  ],
  update: [
    ['path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }],
    ['polyline', { points: '21 3 21 9 15 9' }]
  ],
  check: [
    ['path', { d: 'M20 6 9 17l-5-5' }]
  ],
  cancel: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }]
  ],
  trash: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['line', { x1: '10', y1: '11', x2: '10', y2: '17' }],
    ['line', { x1: '14', y1: '11', x2: '14', y2: '17' }]
  ]
};

function applyProps(node, props) {
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (key === 'className') {
      node.className = value;
    } else if (key === 'textContent') {
      node.textContent = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'attrs') {
      Object.entries(value).forEach(([name, attrValue]) => node.setAttribute(name, attrValue));
    } else {
      node[key] = value;
    }
  });
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  applyProps(node, props);
  node.append(...children.filter(Boolean));
  return node;
}

export function icon(name, size = 14) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  Object.entries({
    width: String(size),
    height: String(size),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }).forEach(([key, value]) => svg.setAttribute(key, value));

  ICONS[name].forEach(([tag, attrs]) => {
    const child = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => child.setAttribute(key, value));
    svg.append(child);
  });

  return svg;
}

export function iconButton({ className, title, dataset, iconName }) {
  return el('button', {
    type: 'button',
    className,
    dataset,
    title,
    attrs: { 'aria-label': title }
  }, [icon(iconName)]);
}
