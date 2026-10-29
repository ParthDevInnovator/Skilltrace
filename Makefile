.PHONY: migrate seed-db test benchmark
migrate:
	.venv/Scripts/alembic upgrade head
seed-db:
	.venv/Scripts/python -m backend.scripts.seed_db
test:
	.venv/Scripts/pytest backend/tests
benchmark:
	.venv/Scripts/pytest backend/tests/benchmarks
