import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Asset path for the Saropa Drift Advisor logo (copied from extension/icon.png).
const String _kLogoAsset = 'assets/logo.png';

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Row-count summary for a single database table.
class TableSummary {
  const TableSummary({required this.name, required this.rowCount});

  final String name;
  final int rowCount;
}

/// Lightweight preview of a post for the dashboard.
class PostPreview {
  const PostPreview({
    required this.title,
    required this.authorName,
    required this.published,
    required this.commentCount,
  });

  final String title;
  final String authorName;

  /// Whether the post has a non-null [publishedAt] date.
  final bool published;
  final int commentCount;
}

/// Summary snapshot of the database returned alongside viewer init state.
class DatabaseSummary {
  const DatabaseSummary({
    required this.tables,
    required this.recentPosts,
  });

  final List<TableSummary> tables;
  final List<PostPreview> recentPosts;
}

// ---------------------------------------------------------------------------
// ViewerInitResult
// ---------------------------------------------------------------------------

/// Result of viewer startup: whether debug is enabled, server is running,
/// optional URL or error, and an optional database summary for the dashboard.
///
/// When [running] is true, [url] should be non-null in practice (copy button
/// is disabled when [url] is null).
/// [errorMessage] is used when initialization failed or when [enabled] is
/// true but the viewer did not start.
class ViewerInitResult {
  const ViewerInitResult({
    required this.enabled,
    required this.running,
    this.url,
    this.errorMessage,
    this.dbSummary,
  });

  final bool enabled;
  final bool running;
  final Uri? url;

  /// When set, initialization failed; show this message to the user.
  final String? errorMessage;

  /// Populated when initialization succeeds; drives the dashboard UI.
  final DatabaseSummary? dbSummary;
}

// ---------------------------------------------------------------------------
// LoadingView
// ---------------------------------------------------------------------------

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const ValueKey('loading'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Saropa logo shown while initializing.
        Image.asset(_kLogoAsset, width: 64, height: 64),
        const SizedBox(height: 24),
        Text(
          'Starting database + viewer…',
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        const SizedBox(
          width: 220,
          child: LinearProgressIndicator(),
        ),
        const SizedBox(height: 12),
        Text(
          'This should only take a moment.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// ReadyView – status header + optional database dashboard
// ---------------------------------------------------------------------------

class ReadyView extends StatelessWidget {
  const ReadyView({required this.init, super.key});
  final ViewerInitResult init;

  @override
  Widget build(BuildContext context) {
    final urlText = init.url?.toString() ?? '';
    final summary = init.dbSummary;

    // When there's no summary data, fall back to the compact status-only view.
    if (summary == null) {
      return _buildStatusOnly(context, urlText);
    }

    // Full dashboard: scrollable column with status header, table overview,
    // and recent-posts preview.
    return SingleChildScrollView(
      key: const ValueKey('ready'),
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Status header ──────────────────────────────────────────────
          _StatusHeader(init: init, urlText: urlText),
          const SizedBox(height: 24),

          // ── Table overview ─────────────────────────────────────────────
          _SectionTitle(label: 'Tables'),
          const SizedBox(height: 8),
          _TableOverview(tables: summary.tables),
          const SizedBox(height: 24),

          // ── Recent posts ───────────────────────────────────────────────
          if (summary.recentPosts.isNotEmpty) ...[
            _SectionTitle(label: 'Recent Posts'),
            const SizedBox(height: 8),
            _RecentPostsList(posts: summary.recentPosts),
          ],
        ],
      ),
    );
  }

  /// Fallback for error / disabled / no-summary states — keeps the original
  /// centered layout so error messages remain prominent.
  Widget _buildStatusOnly(BuildContext context, String urlText) {
    return Column(
      key: const ValueKey('ready'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Saropa logo with fallback icon for error/disabled states.
        if (init.running)
          Image.asset(_kLogoAsset, width: 64, height: 64)
        else
          Icon(
            Icons.info_outline,
            size: 64,
            color: Theme.of(context).colorScheme.primary,
          ),
        const SizedBox(height: 24),
        Text(
          _statusText,
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        if (init.errorMessage != null)
          SelectableText(
            init.errorMessage!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
            textAlign: TextAlign.center,
          )
        else if (init.url != null)
          SelectableText(
            urlText,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  fontFamily: 'monospace',
                ),
            textAlign: TextAlign.center,
          )
        else
          Text(
            init.enabled
                ? 'Another process may already be using port 8642.'
                : 'Build in debug mode to enable the viewer.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
            textAlign: TextAlign.center,
          ),
        const SizedBox(height: 12),
        _CopyUrlButton(url: init.url, urlText: urlText),
      ],
    );
  }

  String get _statusText => init.running
      ? 'Saropa Drift Advisor is running'
      : (init.enabled
          ? 'Advisor failed to start'
          : 'Advisor disabled (release build)');
}

// ---------------------------------------------------------------------------
// Status header – compact bar with green dot, URL, and copy button
// ---------------------------------------------------------------------------

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.init, required this.urlText});
  final ViewerInitResult init;
  final String urlText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      elevation: 0,
      color: colorScheme.primaryContainer.withValues(alpha: 0.4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Saropa logo with a small status dot overlay in the bottom-right.
            SizedBox(
              width: 36,
              height: 36,
              child: Stack(
                children: [
                  Image.asset(_kLogoAsset, width: 32, height: 32),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: init.running ? Colors.green : colorScheme.error,
                        border: Border.all(
                          color: colorScheme.surface,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),

            // Status text + URL.
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    init.running
                        ? 'Drift Advisor is running'
                        : (init.enabled
                            ? 'Advisor failed to start'
                            : 'Advisor disabled'),
                    style: theme.textTheme.titleSmall,
                  ),
                  if (init.url != null)
                    SelectableText(
                      urlText,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontFamily: 'monospace',
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  if (init.errorMessage != null)
                    Text(
                      init.errorMessage!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colorScheme.error,
                      ),
                    ),
                ],
              ),
            ),

            // Copy URL button (icon-only to save space).
            _CopyUrlButton(url: init.url, urlText: urlText, iconOnly: true),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared copy-URL button
// ---------------------------------------------------------------------------

class _CopyUrlButton extends StatelessWidget {
  const _CopyUrlButton({
    required this.url,
    required this.urlText,
    this.iconOnly = false,
  });

  final Uri? url;
  final String urlText;
  final bool iconOnly;

  @override
  Widget build(BuildContext context) {
    final onPressed = url != null
        ? () async {
            await Clipboard.setData(ClipboardData(text: urlText));
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Copied viewer URL')),
            );
          }
        : null;

    if (iconOnly) {
      return IconButton(
        onPressed: onPressed,
        icon: const Icon(Icons.copy, size: 20),
        tooltip: 'Copy URL',
      );
    }

    return FilledButton.tonalIcon(
      onPressed: onPressed,
      icon: const Icon(Icons.copy),
      label: const Text('Copy URL'),
    );
  }
}

// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
    );
  }
}

// ---------------------------------------------------------------------------
// Table overview – row of chips showing table name + row count
// ---------------------------------------------------------------------------

class _TableOverview extends StatelessWidget {
  const _TableOverview({required this.tables});
  final List<TableSummary> tables;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tables.map((t) {
        return Card(
          elevation: 0,
          color: colorScheme.surfaceContainerHighest,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.table_chart_outlined,
                    size: 16, color: colorScheme.primary),
                const SizedBox(width: 6),
                Text(
                  t.name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 8),
                // Row count badge.
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${t.rowCount}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// Recent posts list – simple cards showing title, author, status, comments
// ---------------------------------------------------------------------------

class _RecentPostsList extends StatelessWidget {
  const _RecentPostsList({required this.posts});
  final List<PostPreview> posts;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Column(
      children: posts.map((post) {
        return Card(
          elevation: 0,
          color: colorScheme.surfaceContainerLow,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          child: ListTile(
            leading: Icon(
              post.published ? Icons.article : Icons.edit_note,
              color: post.published
                  ? colorScheme.primary
                  : colorScheme.onSurfaceVariant,
            ),
            title: Text(post.title),
            subtitle: Text(
              '${post.authorName}  •  '
              '${post.published ? "Published" : "Draft"}  •  '
              '${post.commentCount} comment${post.commentCount == 1 ? "" : "s"}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
