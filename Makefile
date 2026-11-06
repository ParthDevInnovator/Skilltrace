.PHONY: migrate test benchmark
migrate:
	.venv/Scripts/alembic upgrade head
test:
	.venv/Scripts/pytest backend/tests
benchmark:
	.venv/Scripts/pytest backend/tests/benchmarks
