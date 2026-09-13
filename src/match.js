'use strict';

// Space-separated terms, all of which must appear. Order does not matter, so
// "e2e call" finds "Test / Branch / E2E-Simple-Call".
function matchesQuery(haystack, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = haystack.toLowerCase();
  return terms.every((term) => text.includes(term));
}

const GROUP_TITLES = {
  favorites: 'My favorites',
  all: 'All workflows',
};

// Two groups, in sidebar order. The repository's own pins get no group of
// their own: they are someone else's choice, they change without notice, and
// GitHub already shows them. Favorites are the list the user curates.
function groupRows(rows, { favorites = [] } = {}) {
  const rank = new Map(favorites.map((id, i) => [id, i]));
  const isFavorite = (row) => rank.has(row.id);

  return [
    {
      key: 'favorites',
      title: GROUP_TITLES.favorites,
      rows: rows.filter(isFavorite).sort((a, b) => rank.get(a.id) - rank.get(b.id)),
    },
    {
      key: 'all',
      title: GROUP_TITLES.all,
      rows: rows.filter((row) => !isFavorite(row)),
    },
  ];
}

// Drop empty groups. Then only keep the headers if more than one group
// survives, because a lone header above a flat list says nothing.
function visibleGroups(groups) {
  const filled = groups.filter((group) => group.rows.length);
  return filled.length > 1 ? filled : filled.map((group) => ({ ...group, title: null }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchesQuery, groupRows, visibleGroups, GROUP_TITLES };
}
