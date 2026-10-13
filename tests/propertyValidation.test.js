import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateProperty } from '../src/features/properties/propertyValidation.js';

const valid = {
  title: 'Harbor House', slug: 'harbor-house', description: 'A light-filled home near the water.', currency: 'NGN', price: '1200000',
  bedrooms: '3', bathrooms: '2.5', toilets: '3', parking_spaces: '2', area_sqm: '210', land_area_sqm: '',
};

test('slugifies a title into a stable lowercase URL segment', () => {
  assert.equal(slugify('  Résidence & Gardens  '), 'residence-gardens');
});

test('accepts valid numeric listing details and one image with alt text', () => {
  assert.equal(validateProperty(valid, [{ alt_text: 'Sunlit exterior', is_cover: true }]), '');
});

test('rejects malformed slugs and empty descriptions', () => {
  assert.match(validateProperty({ ...valid, slug: 'Harbor House' }), /URL-friendly slug/);
  assert.match(validateProperty({ ...valid, description: '  ' }), /description/);
});

test('rejects negative values and fractional bedroom counts', () => {
  assert.match(validateProperty({ ...valid, price: '-1' }), /Price/);
  assert.match(validateProperty({ ...valid, bedrooms: '2.5' }), /whole number/);
  assert.match(validateProperty({ ...valid, area_sqm: '0' }), /greater than zero/);
});

test('requires meaningful alt text and a single cover image', () => {
  assert.match(validateProperty(valid, [{ alt_text: '', is_cover: true }]), /alternative text/);
  assert.match(validateProperty(valid, [{ alt_text: 'Front room', is_cover: true }, { alt_text: 'Kitchen', is_cover: true }]), /only one cover/);
});

