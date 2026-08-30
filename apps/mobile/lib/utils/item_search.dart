// Client-side item matching for the Items screen.
//
// The server already searches items (per-word AND over name and SKU). This
// mirrors that rule so a locally-filtered catalogue answers the same query
// the same way, then *ranks* the survivors — something the server list, which
// orders by category and name, does not do. Rank is what makes a short query
// useful: typing "gh" should put "Ghee 500ml" above "Fresh Ghee Jar", and
// an exact SKU should win outright.
//
// Pure functions, no Flutter, no I/O — the interesting part is the ordering,
// and ordering is worth a test.

library;

/// Rank of an item against [query]; null when it does not match at all.
/// Lower sorts first. The bands are deliberately coarse — inside a band the
/// caller breaks ties on name, which keeps the order stable as stock moves.
const _rankSkuExact = 0;
const _rankNameExact = 1;
const _rankSkuPrefix = 2;
const _rankNamePrefix = 3;
const _rankWordStart = 4;
const _rankInitials = 5;
const _rankContains = 6;

int? itemMatchRank({required String name, String? sku, required String query}) {
  final q = _norm(query);
  if (q.isEmpty) return _rankContains;
  final n = _norm(name);
  final s = _norm(sku ?? '');

  // Every word must land somewhere, so "cow milk" finds "Milk Cow A2 1L"
  // whichever order it was typed in. Same rule the server applies.
  final terms = q.split(' ').where((t) => t.isNotEmpty);
  final everyTermHits = terms.every(
    (t) => n.contains(t) || (s.isNotEmpty && s.contains(t)),
  );

  // Initials are an escape hatch for long names the floor abbreviates:
  // "dgb" → "Desi Ghee Bottle". Single-word queries only — with a space the
  // user is already typing words, and initials would match near enough
  // everything.
  final initialsHit =
      !q.contains(' ') && q.length >= 2 && _initials(n).startsWith(q);

  if (!everyTermHits && !initialsHit) return null;
  if (s.isNotEmpty && s == q) return _rankSkuExact;
  if (n == q) return _rankNameExact;
  if (s.isNotEmpty && s.startsWith(q)) return _rankSkuPrefix;
  if (n.startsWith(q)) return _rankNamePrefix;
  if (n.split(' ').any((w) => w.startsWith(q))) return _rankWordStart;
  if (!everyTermHits) return _rankInitials;
  return _rankContains;
}

/// [rows] that match [query], best match first. Ties inside a rank band fall
/// back to name so the list does not reshuffle between keystrokes.
///
/// An empty query returns [rows] untouched — the caller's own order (the
/// category sectioning) is the right answer when nothing has been typed.
List<T> rankedItemMatches<T>(
  List<T> rows,
  String query, {
  required String Function(T) name,
  required String? Function(T) sku,
}) {
  if (query.trim().isEmpty) return rows;
  final scored = <({T row, int rank, String name})>[];
  for (final r in rows) {
    final rank = itemMatchRank(name: name(r), sku: sku(r), query: query);
    if (rank != null) {
      scored.add((row: r, rank: rank, name: _norm(name(r))));
    }
  }
  scored.sort((a, b) {
    final byRank = a.rank.compareTo(b.rank);
    return byRank != 0 ? byRank : a.name.compareTo(b.name);
  });
  return [for (final s in scored) s.row];
}

String _norm(String v) => v.toLowerCase().trim().replaceAll(RegExp(r'\s+'), ' ');

String _initials(String normalisedName) {
  final buf = StringBuffer();
  for (final w in normalisedName.split(' ')) {
    if (w.isNotEmpty) buf.write(w[0]);
  }
  return buf.toString();
}
