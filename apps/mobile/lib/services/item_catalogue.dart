// Catalogue reads for the Items screen — the two fetches whose *shape* is
// the interesting part, kept away from the view state that consumes them.
//
// Both answer a question the raw endpoint does not: "can this tenant's whole
// catalogue be held in memory", and "what does the category tree look like
// once the items filed under nothing are counted too".

library;

import '../api/inventory_models.dart';
import '../api/inventory_repo.dart';
import '../screens/inventory/widgets/item_class_strip.dart';

/// The API caps a page at 500 rows. A catalogue that fits under the cap can
/// be held whole and queried in memory; anything larger has to stay on the
/// server, because a partial cache would silently hide items from a search.
const itemCatalogueCap = 500;

class ItemCatalogue {
  const ItemCatalogue._();

  /// Every active item in one page, or null when the tenant is past the cap
  /// or the fetch failed. Null means "use the paginated list" — a slower
  /// screen, not a broken one, so a failure needs no error state of its own.
  static Future<List<InvItemListRow>?> fetchAll() async {
    try {
      final res = await inventoryRepo.items(
        limit: itemCatalogueCap,
        // Balance is the headline number on every tile.
        withStock: true,
        // category → subcategory → name, so the cached rows arrive in the
        // order the sectioned list wants to render them.
        sort: 'category',
      );
      return res.total <= itemCatalogueCap ? res.rows : null;
    } on Exception {
      return null;
    }
  }

  /// The category tree under [classGroup], with the no-category bucket
  /// counted alongside it. The tree cannot carry a bucket for items filed
  /// under nothing, so that count is a second, one-row query.
  static Future<({List<InvCategory> tree, int uncategorised})> fetchTree(
    String classGroup,
  ) async {
    final q = itemClassQuery(classGroup);
    final tree = await inventoryRepo.categoryTree(
      withCounts: true,
      itemClassGroup: q.itemClassGroup,
      itemClass: q.itemClass,
      unclassified: q.unclassified,
    );
    final orphans = await inventoryRepo.items(
      limit: 1,
      uncategorised: true,
      itemClassGroup: q.itemClassGroup,
      itemClass: q.itemClass,
      unclassified: q.unclassified,
      status: q.status,
    );
    return (tree: tree, uncategorised: orphans.total);
  }
}
