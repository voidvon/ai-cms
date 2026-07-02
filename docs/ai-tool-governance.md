# AI Tool Governance

## Rule

AI tools must follow:

`tool -> service -> data source`

Do not expose arbitrary SQL or unrestricted database access to the model.

## Current tool matrix

| Tool | Access | Permissions | Data source | Exposed now |
| --- | --- | --- | --- | --- |
| `query_columns` | read | `read:content` | `columns` + translations | `/ai` |
| `query_content_items` | read | `read:content` | managed content tables | `/ai` |
| `price_lookup` | read | `read:prices` | stub price catalog | `/ai`, 文档工作台 |
| `query_news` | read | `read:all` | `news` table | not in `/ai` whitelist |
| `query_contacts` | read | `read:all` | `contacts` table | not in `/ai` whitelist |
| `query_product_categories` | read | none | product column tree | not in `/ai` whitelist |
| `contract_clause_picker` | read | none | stub clause catalog | 文档工作台 |
| `get_document_workspace_context` | read | login context | `document_drafts` | 文档工作台 |
| `set_document_customer` | write | `write:documents` | `document_drafts` | 文档工作台 |
| `set_document_seller` | write | `write:documents` | `document_drafts` | 文档工作台 |
| `replace_document_items` | write | `write:documents` | `document_drafts` | 文档工作台 |
| `set_document_terms` | write | `write:documents` | `document_drafts` | 文档工作台 |
| `set_document_pricing` | write | `write:documents` | `document_drafts` | 文档工作台 |
| `apply_document_patch` | write | `write:documents` | `document_drafts` | 文档工作台 |

## Permission aliases

- `read:content` -> `03`
- `write:content` -> `03`
- `read:products` -> `03`
- `write:products` -> `03`
- `read:prices` -> `03`
- `write:prices` -> `03`
- `read:documents` -> `03`
- `write:documents` -> `03`
- `read:all` -> `10`
- `write:all` -> `10`

## Data source policy

1. If the required data source is unavailable, the tool should not be advertised as enabled.
2. Stub tools must clearly mark their output as stub or placeholder.
3. Write tools must enforce permission at mutation execution, not only at route entry.
4. Capability whitelists decide visibility; permission checks decide executability.

## Direction

The preferred CMS abstraction is:

- columns
- content items

`products`, `news`, and similar labels should be treated as business-facing interpretations of a column tree plus its bound content model, not as first-class AI tool primitives.
