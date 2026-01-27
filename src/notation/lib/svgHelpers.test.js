/** @jest-environment jsdom */

import {
  createSvgElement,
  createGroup,
  createLine,
  createEllipse,
  createText,
  createPath,
} from './svgHelpers';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('svgHelpers', () => {
  describe('createSvgElement', () => {
    it('creates an SVG element with the correct namespace', () => {
      const el = createSvgElement('rect');
      expect(el.namespaceURI).toBe(SVG_NS);
      expect(el.tagName).toBe('rect');
    });

    it('sets attributes from the provided object', () => {
      const el = createSvgElement('rect', { x: '10', y: '20', width: '100' });
      expect(el.getAttribute('x')).toBe('10');
      expect(el.getAttribute('y')).toBe('20');
      expect(el.getAttribute('width')).toBe('100');
    });

    it('creates an element with no attributes when none provided', () => {
      const el = createSvgElement('circle');
      expect(el.attributes.length).toBe(0);
    });
  });

  describe('createGroup', () => {
    it('creates a <g> element', () => {
      const g = createGroup();
      expect(g.tagName).toBe('g');
      expect(g.namespaceURI).toBe(SVG_NS);
    });

    it('sets a class name when provided', () => {
      const g = createGroup('staff-lines');
      expect(g.getAttribute('class')).toBe('staff-lines');
    });

    it('sets additional attributes', () => {
      const g = createGroup('note', { 'data-beat': '0' });
      expect(g.getAttribute('class')).toBe('note');
      expect(g.getAttribute('data-beat')).toBe('0');
    });

    it('creates a group with no class when not provided', () => {
      const g = createGroup();
      expect(g.hasAttribute('class')).toBe(false);
    });
  });

  describe('createLine', () => {
    it('creates a <line> element with coordinates', () => {
      const line = createLine(0, 10, 800, 10);
      expect(line.tagName).toBe('line');
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('10');
      expect(line.getAttribute('x2')).toBe('800');
      expect(line.getAttribute('y2')).toBe('10');
    });

    it('sets additional attributes', () => {
      const line = createLine(0, 0, 100, 100, { class: 'staff-line' });
      expect(line.getAttribute('class')).toBe('staff-line');
    });
  });

  describe('createEllipse', () => {
    it('creates an <ellipse> element with center and radii', () => {
      const el = createEllipse(0, 0, 6, 5);
      expect(el.tagName).toBe('ellipse');
      expect(el.getAttribute('cx')).toBe('0');
      expect(el.getAttribute('cy')).toBe('0');
      expect(el.getAttribute('rx')).toBe('6');
      expect(el.getAttribute('ry')).toBe('5');
    });

    it('sets additional attributes', () => {
      const el = createEllipse(10, 20, 6, 5, { class: 'note-head' });
      expect(el.getAttribute('class')).toBe('note-head');
    });
  });

  describe('createText', () => {
    it('creates a <text> element with content', () => {
      const el = createText('4', 50, 60);
      expect(el.tagName).toBe('text');
      expect(el.getAttribute('x')).toBe('50');
      expect(el.getAttribute('y')).toBe('60');
      expect(el.textContent).toBe('4');
    });

    it('sets additional attributes', () => {
      const el = createText('4', 50, 60, { class: 'time-numerator' });
      expect(el.getAttribute('class')).toBe('time-numerator');
    });
  });

  describe('createPath', () => {
    it('creates a <path> element with a d attribute', () => {
      const el = createPath('M 0 0 L 10 10');
      expect(el.tagName).toBe('path');
      expect(el.getAttribute('d')).toBe('M 0 0 L 10 10');
    });

    it('sets additional attributes', () => {
      const el = createPath('M 0 0', { class: 'note-flag', fill: 'black' });
      expect(el.getAttribute('class')).toBe('note-flag');
      expect(el.getAttribute('fill')).toBe('black');
    });
  });
});
