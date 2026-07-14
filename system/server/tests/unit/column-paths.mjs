import assert from 'node:assert/strict';
import {
  buildContentDetailPathFromColumn,
  buildContentDetailUrlFromColumn,
} from '../../src/services/column-paths.mjs';

const entry = { id: 358, custom_url: '' };
const fullRouteColumn = {
  route_path: '/products/pipeline-ancillaries/separators/',
  detail_rule: '{id}/index.html',
};

assert.equal(
  buildContentDetailUrlFromColumn(entry, fullRouteColumn, 'pipeline-ancillaries/separators'),
  '/products/pipeline-ancillaries/separators/358/',
);
assert.equal(
  buildContentDetailPathFromColumn(entry, fullRouteColumn, 'pipeline-ancillaries/separators'),
  'products/pipeline-ancillaries/separators/358/index.html',
);

const rootRouteColumn = {
  route_path: '/products/',
  detail_rule: '{id}/index.html',
};
assert.equal(
  buildContentDetailUrlFromColumn(entry, rootRouteColumn, 'pipeline-ancillaries/separators'),
  '/products/pipeline-ancillaries/separators/358/',
);
assert.equal(
  buildContentDetailPathFromColumn(entry, rootRouteColumn, 'pipeline-ancillaries/separators'),
  'products/pipeline-ancillaries/separators/358/index.html',
);

const customEntry = { id: 358, custom_url: 's13-sg-iron-separator/index.html' };
assert.equal(
  buildContentDetailUrlFromColumn(customEntry, fullRouteColumn, 'pipeline-ancillaries/separators'),
  '/products/pipeline-ancillaries/separators/s13-sg-iron-separator/',
);
assert.equal(
  buildContentDetailPathFromColumn(customEntry, fullRouteColumn, 'pipeline-ancillaries/separators'),
  'products/pipeline-ancillaries/separators/s13-sg-iron-separator/index.html',
);

console.log('column-paths unit checks passed');
