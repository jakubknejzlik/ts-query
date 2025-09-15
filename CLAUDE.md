# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript SQL query builder library that provides a fluent API for building SQL queries in a type-safe manner. It supports multiple SQL flavors (MySQL, SQLite, AWS Timestream) and includes features like serialization, compression, and metadata extraction.

## Common Development Commands

### Building
```bash
npm run build       # Compile TypeScript to dist/
npm run prepublishOnly  # Same as build, runs before publishing
```

### Testing
```bash
npm test           # Run all tests once
npm run test:watch # Run tests in watch mode
jest src/Query.test.ts  # Run a specific test file
```

### Documentation/Storybook
```bash
npm run storybook  # Start Storybook dev server on port 6006
npm run build-storybook  # Build static Storybook site
```

## Architecture Overview

### Core Classes and Concepts

1. **Query (Q)** - The main query builder class located in `src/Query.ts`. Provides the fluent API for building SELECT queries with methods like `select()`, `from()`, `where()`, `join()`, etc.

2. **Condition (Cond)** - Located in `src/Condition.ts`. Handles WHERE clause conditions with static factory methods like `Cond.equal()`, `Cond.and()`, `Cond.or()`, etc.

3. **Function (Fn)** - Located in `src/Function.ts`. Provides SQL function helpers like `Fn.sum()`, `Fn.max()`, `Fn.count()`, etc.

4. **Mutations** - Located in `src/Mutation.ts`. Includes `InsertMutation`, `UpdateMutation`, and `DeleteMutation` classes for DML operations.

5. **SQL Flavors** - Located in `src/flavors/`. Each flavor (MySQL, SQLite, AWS Timestream) extends the base flavor and customizes SQL generation, escaping rules, and type conversions.

### Key Interfaces

- **ISequelizable** - Objects that can be converted to SQL strings via `toSQL(flavor)`
- **ISerializable** - Objects that can be serialized/deserialized to/from JSON
- **IMetadata** - Objects that can provide metadata like table names and operation types

### Serialization System

The library supports serializing queries to JSON and compressing them using pako. Each major class implements:
- `toJSON()` - Convert to plain object
- `fromJSON()` - Reconstruct from plain object  
- `serialize()` - Convert to JSON string (optionally compressed)
- `deserialize()` - Reconstruct from JSON string

### Type System

The library uses TypeScript's type system extensively with:
- Union types for flexible value inputs (e.g., `ExpressionValue`)
- Generic constraints for type-safe operations
- Discriminated unions for different condition/expression types

## Key Development Patterns

1. All SQL-generating classes implement `ISequelizable` with a `toSQL(flavor)` method
2. Test files follow the pattern `[ClassName].test.ts` and use Jest
3. Each SQL flavor handles its own escaping and formatting rules
4. The library uses method chaining for fluent API (most methods return `this`)
5. Static factory methods are preferred for creating conditions and functions