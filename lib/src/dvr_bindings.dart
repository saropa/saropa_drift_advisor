/// JSON-safe normalization for Query Replay DVR `params` payloads.
///
/// Optional `/api/sql` fields `args` and `namedArgs` supply declared bindings
/// for the timeline (never inferred from SQL text). When the host passes
/// [DriftDebugQueryWithBindings] to [ServerContext], those values are also
/// forwarded to the executor via `queryWithBindings`; otherwise bindings are
/// metadata-only for DVR.
library;

import 'dart:convert';
import 'dart:typed_data';

/// Maximum string length stored per scalar binding before truncation.
const int kDvrMaxParamStringLength = 2048;

/// Normalizes a single value to JSON-safe form for DVR transport.
Object? normalizeDvrJsonValue(Object? value) {
  if (value == null || value is bool || value is num) {
    return value;
  }
  if (value is String) {
    if (value.length <= kDvrMaxParamStringLength) {
      return value;
    }
    return value.substring(0, kDvrMaxParamStringLength);
  }
  if (value is List) {
    return value
        .map((e) => normalizeDvrJsonValue(e as Object?))
        .toList(growable: false);
  }
  if (value is Uint8List) {
    final len = value.length;
    final preview = len > 48 ? value.sublist(0, 48) : value;
    return <String, Object?>{
      '__kind': 'blob',
      'byteLength': len,
      'previewBase64': base64Encode(preview),
    };
  }
  if (value is Map) {
    final out = <String, Object?>{};
    for (final e in value.entries) {
      out['${e.key}'] = normalizeDvrJsonValue(e.value as Object?);
    }
    return out;
  }
  return '[unsupported:${value.runtimeType}]';
}

/// Builds [RecordedQuery.params] from optional HTTP `args` / `namedArgs`.
///
/// Returns `null` when both are empty (no declared bindings for this request).
({Map<String, Object?> params, bool truncated})? dvrParamsFromDeclarations({
  List<dynamic>? positional,
  Map<String, dynamic>? named,
}) {
  final rawPos = positional ?? const <dynamic>[];
  final rawNamed = named ?? const <String, dynamic>{};
  if (rawPos.isEmpty && rawNamed.isEmpty) {
    return null;
  }
  var truncated = false;
  final pos = <Object?>[];
  for (final v in rawPos) {
    if (v is String && v.length > kDvrMaxParamStringLength) {
      truncated = true;
    }
    pos.add(normalizeDvrJsonValue(v));
  }
  final outNamed = <String, Object?>{};
  for (final e in rawNamed.entries) {
    final val = e.value;
    if (val is String && val.length > kDvrMaxParamStringLength) {
      truncated = true;
    }
    outNamed[e.key] = normalizeDvrJsonValue(val);
  }
  return (
    params: <String, Object?>{'positional': pos, 'named': outNamed},
    truncated: truncated,
  );
}
