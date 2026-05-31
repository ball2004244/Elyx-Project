# Coding Syntax & Style

This document outlines the coding syntax and style guidelines for the project. Adhering to these guidelines will help maintain a consistent codebase and improve readability.

## General Guidelines

- Use meaningful variable and function names.
- Keep functions small and focused on a single task.
- Write comments to explain complex logic.
- Follow the DRY principle.

## Formatting

- Use 2/4 spaces for indentation (depends on languages)
- Limit lines to 80 characters.
- Use blank lines to separate logical sections of code.

## Naming convention

- Always use descriptive but concise names for variables, functions, and classes.
- Always use well-known jargons and terms, not too verbose variables.
- Use **camelCase** for variables, constants, and functions; **PascalCase** for classes, components, and types/schemas.
- Class/component/type names start with Nouns, functions with Verbs, var/const is either a noun or verb phrase depending on context.

Bad e.g 1: calculteFactorial() -> calcFactorial() or factorial().
Bad e.g 2: userToIndexMapping -> userIdxMap.

Good e.g 1: calcFactorial() or factorial()
Good e.g 2: userIdxMap
Good e.g 3: fetchData() or getData()
And similar cases...

## Testing

- ALWAYS write unit tests for every function/module of a sprint.
- Follow the **3-3-3 rule** per test suite: **3 happy** (typical success), **3 hard** (complex-but-valid: multi-constraint, substitution, real data), **3 edge** (boundary/error: empty, malformed, inverted, missing) — 9 cases total.
- Group the cases under explicit `Happy` / `Hard` / `Edge` section comments.
- If you modify an existing function/object, update its tests accordingly.

## Environment

- ALWAYS use the project's package manager (bun) for running scripts and installing packages.
