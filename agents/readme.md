# Agent Instructions

You are working on a NestJS backend project.

Before implementing any feature:
1. Read PROJECT_CONTEXT.md
2. Read ARCHITECTURE.md
3. Read CODING_RULES.md
4. Read DATABASE_RULES.md
5. Read API_RULES.md

When creating a new feature:
- Follow feature-based structure.
- Create controller, service, DTO, entity, repository interface, repository implementation.
- Register providers correctly in the module.
- Use dependency injection.
- Do not skip validation.
- Do not put business logic in controller.
- Do not directly use TypeORM Repository in service.
- Add tests if relevant.

When modifying existing code:
- First inspect current patterns.
- Reuse existing helpers and conventions.
- Do not refactor unrelated files.
- Keep changes minimal and focused.

Before finishing:
- Check TypeScript errors.
- Check imports.
- Check module registration.
- Explain what was changed.