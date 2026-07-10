# Legacy Prisma Migrations

`20260704125200_init` is an early project migration that was never applied to the current `dev.db`.

It contains the legacy `Part`, `Drawing`, and `OutsourcingRecord` structures, which do not match the current production schema. It is retained here only for historical reference and must not be returned to the active Prisma migration chain or executed.

The active migration chain starts with the current-schema baseline in `prisma/migrations`.
