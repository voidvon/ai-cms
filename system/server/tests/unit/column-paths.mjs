import assert from 'node:assert/strict';
import {
  buildContentDetailPathFromColumn,
  buildContentDetailUrlFromColumn,
  resolveColumnPageOutputPath,
  resolvePublicPageOutputPath,
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

const managedRoot = {
  id: 329,
  parent_id: null,
  route_path: '/learn-about-steam/',
  dir_name: 'learn-about-steam',
};
const managedColumn = {
  id: 319,
  parent_id: 329,
  route_path: '/learn-about-steam/control-hardware---self-acting-actuation/',
  dir_name: 'control-hardware-self-acting-actuation',
};
const managedColumnMap = new Map([
  [managedRoot.id, managedRoot],
  [managedColumn.id, managedColumn],
]);

assert.equal(
  resolveColumnPageOutputPath(managedColumn, managedColumnMap),
  'learn-about-steam/control-hardware---self-acting-actuation/index.html',
);
assert.equal(
  resolveColumnPageOutputPath(managedColumn, managedColumnMap, 2),
  'learn-about-steam/control-hardware---self-acting-actuation/index-2.html',
);
assert.equal(
  resolvePublicPageOutputPath('/learn-about-steam/control-hardware---self-acting-actuation/', 3),
  'learn-about-steam/control-hardware---self-acting-actuation/index-3.html',
);

const derivedManagedColumn = {
  id: 320,
  parent_id: 329,
  route_path: '',
  dir_name: 'derived-column',
};
managedColumnMap.set(derivedManagedColumn.id, derivedManagedColumn);

assert.equal(
  resolveColumnPageOutputPath(derivedManagedColumn, managedColumnMap),
  'learn-about-steam/derived-column/index.html',
);

console.log('column-paths unit checks passed');
