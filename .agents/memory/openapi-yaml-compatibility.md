---
name: OpenAPI YAML compatibility
description: Avoid YAML merge keys in contracts consumed by Orval.
---

Use explicit path and component-schema mappings, not YAML merge keys (`<<`), in the OpenAPI contract consumed by Orval.

**Why:** A YAML loader can expand merge keys successfully while Orval treats them as literal component names and rejects the contract. Successful generic YAML parsing does not establish generator compatibility.

**How to apply:** When combining API contracts, preserve both sets of operations and schema fields explicitly, check duplicate keys, and regenerate the clients and validators. Do not resolve generated-client conflicts by hand.