# CSS Parser Documentation

Start with the [README](../README.md) for installation and common examples.

- [Parsing, diagnostics, and budgets](./parsing.md) explains text, byte, fragment, token, and stream entrypoints.
- [Trees, traversal, and source edits](./trees-and-editing.md) covers the returned tree, serialization, traversal, chunking, and patch plans.
- [Selector support](./selectors.md) documents selector compilation and querying.
- [Style and render signals](./render-signals.md) covers the extraction helpers used by downstream document tools.
- [Development and releases](./development.md) contains the repository layout and verification commands.

The [runnable examples](../examples/) exercise the main package entrypoint. Security-sensitive consumers should also read the [security policy](../SECURITY.md).
