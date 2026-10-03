---
name: OpenAPI generator compatibility
description: YAML merge handling and generated path/query naming collisions in Orval.
---

Use explicit path and component-schema mappings, not YAML merge keys (`<<`), in the OpenAPI contract consumed by Orval.

**Why:** A YAML loader can expand merge keys successfully while Orval treats them as literal component names and rejects the contract. Successful generic YAML parsing does not establish generator compatibility.

**How to apply:** When combining API contracts, preserve both sets of operations and schema fields explicitly, check duplicate keys, and regenerate the clients and validators. Do not resolve generated-client conflicts by hand.

Check generated export names when an operation combines path and query parameters.

**Why:** In this workspace's shared validator/type barrel, Orval can name both the path validator and the TypeScript query model `OperationParams`, causing a duplicate export. Word-detail pagination uses path parameters to avoid that collision without hand-editing generated files.

**How to apply:** When adding a path-plus-query operation, run codegen and check barrel compilation. Resolve naming at the contract or generator level, not by modifying generated output or suppressing type errors.