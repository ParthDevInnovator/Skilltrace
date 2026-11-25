"""Export the Skitrace OpenAPI (Swagger) specification to docs/.

Usage, from the repository root:

    .venv\\Scripts\\python -m backend.scripts.export_openapi            # docs/openapi.json + docs/openapi.yaml
    .venv\\Scripts\\python -m backend.scripts.export_openapi --out api   # another directory

The schema is built from the FastAPI app without starting the server, so the
export always matches the code. Load either file in https://editor.swagger.io,
Postman or Insomnia, or browse the live version at http://localhost:8000/docs.
"""
import argparse
import json
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "docs", help="output directory (default: docs/)")
    parser.add_argument("--server", default="http://localhost:8000", help="server URL written into the spec")
    args = parser.parse_args()

    from backend.main import app  # imported late: importing builds settings and routers

    schema = dict(app.openapi())
    schema["servers"] = [{"url": args.server, "description": "Local development backend"}]

    args.out.mkdir(parents=True, exist_ok=True)
    json_path, yaml_path = args.out / "openapi.json", args.out / "openapi.yaml"
    json_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    yaml_path.write_text(yaml.safe_dump(schema, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")

    operations = sum(1 for ops in schema["paths"].values() for method in ops if method != "parameters")
    print(f"Wrote {json_path} and {yaml_path}: {len(schema['paths'])} paths, {operations} operations")


if __name__ == "__main__":
    main()
