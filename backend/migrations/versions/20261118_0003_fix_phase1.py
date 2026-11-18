"""Fix Phase 1: durable runtime candidates, workspaces, sessions and audit fields.

Idempotent: revision 0001 builds tables from the live models, so a fresh
database may already contain some of these columns and tables.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261118_0003"
down_revision = "20261029_0002"
branch_labels = None
depends_on = None

DEFAULT_WORKSPACE = "default"


def _columns(inspector, table):
    return {column["name"] for column in inspector.get_columns(table)}


def _add_columns(inspector, table, columns):
    existing = _columns(inspector, table)
    missing = [column for column in columns if column.name not in existing]
    if missing:
        with op.batch_alter_table(table) as batch:
            for column in missing:
                batch.add_column(column)


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "workspaces" not in tables:
        op.create_table("workspaces",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("allowed_domains", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))

    _add_columns(inspector, "users", [
        sa.Column("workspace_id", sa.String(64), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("auth_provider", sa.String(32), nullable=False, server_default="native"),
        sa.Column("provider_subject", sa.String(255), nullable=True),
    ])
    for table in ("candidates", "jobs", "match_results", "chat_history", "context_build_status"):
        _add_columns(inspector, table, [sa.Column("workspace_id", sa.String(64), nullable=True)])
    _add_columns(inspector, "candidates", [sa.Column("profile_json", sa.JSON(), nullable=True)])
    _add_columns(inspector, "context_build_status", [
        sa.Column("revision", sa.String(64), nullable=True),
        sa.Column("context_json", sa.JSON(), nullable=True),
        sa.Column("unavailable_sources", sa.JSON(), nullable=True),
    ])
    _add_columns(inspector, "audit_logs", [
        sa.Column("workspace_id", sa.String(64), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
    ])

    # Audit rows must outlive (and exist for) candidates that are not SQL rows.
    inspector = sa.inspect(bind)
    audit_fks = [fk for fk in inspector.get_foreign_keys("audit_logs") if fk.get("referred_table") == "candidates"]
    if audit_fks:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("audit_logs", recreate="always",
                                      reflect_args=[sa.Column("candidate_id", sa.String(64), nullable=True)]):
                pass
        else:
            for fk in audit_fks:
                if fk.get("name"):
                    op.drop_constraint(fk["name"], "audit_logs", type_="foreignkey")

    if "candidate_resumes" not in tables:
        op.create_table("candidate_resumes",
            sa.Column("candidate_id", sa.String(64), sa.ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("workspace_id", sa.String(64), nullable=True, index=True),
            sa.Column("revision", sa.String(64), nullable=False),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("content", sa.LargeBinary(), nullable=False),
            sa.Column("parsed_json", sa.JSON(), nullable=False),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False))
    if "membership_requests" not in tables:
        op.create_table("membership_requests",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("workspace_id", sa.String(64), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("status", sa.String(16), nullable=False, index=True),
            sa.Column("decided_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    if "refresh_sessions" not in tables:
        op.create_table("refresh_sessions",
            sa.Column("jti", sa.String(64), primary_key=True),
            sa.Column("family_id", sa.String(64), nullable=False, index=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("replaced_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    if "revoked_tokens" not in tables:
        op.create_table("revoked_tokens",
            sa.Column("jti", sa.String(64), primary_key=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True))
    if "oauth_states" not in tables:
        op.create_table("oauth_states",
            sa.Column("state_hash", sa.String(64), primary_key=True),
            sa.Column("binding_hash", sa.String(64), nullable=False),
            sa.Column("code_verifier", sa.String(128), nullable=False),
            sa.Column("provider", sa.String(32), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    if "one_time_tokens" not in tables:
        op.create_table("one_time_tokens",
            sa.Column("token_hash", sa.String(64), primary_key=True),
            sa.Column("purpose", sa.String(32), nullable=False, index=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))

    # Backfill: every existing record belongs to the default workspace, and
    # previously admitted accounts keep their access.
    if not bind.execute(sa.text("SELECT 1 FROM workspaces WHERE id = :id"), {"id": DEFAULT_WORKSPACE}).first():
        bind.execute(sa.text("INSERT INTO workspaces (id, name, allowed_domains, created_at) "
                             "VALUES (:id, 'Default workspace', '[]', CURRENT_TIMESTAMP)"), {"id": DEFAULT_WORKSPACE})
    for table in ("candidates", "jobs", "match_results", "chat_history", "context_build_status", "audit_logs"):
        bind.execute(sa.text(f"UPDATE {table} SET workspace_id = :id WHERE workspace_id IS NULL"), {"id": DEFAULT_WORKSPACE})
    bind.execute(sa.text("UPDATE users SET workspace_id = :id, email_verified = :yes WHERE workspace_id IS NULL"),
                 {"id": DEFAULT_WORKSPACE, "yes": True})
    bind.execute(sa.text("UPDATE users SET auth_provider = 'clerk' WHERE hashed_password = 'managed-by-clerk'"))
    rows = bind.execute(sa.text("SELECT id, email FROM users WHERE auth_provider = 'clerk' AND provider_subject IS NULL")).all()
    for user_id, email in rows:
        if email and email.endswith("@clerk.local"):
            bind.execute(sa.text("UPDATE users SET provider_subject = :subject WHERE id = :id"),
                         {"subject": email[: -len("@clerk.local")], "id": user_id})

    inspector = sa.inspect(bind)
    if not any(constraint.get("name") == "uq_users_provider_subject" for constraint in inspector.get_unique_constraints("users")):
        with op.batch_alter_table("users") as batch:
            batch.create_unique_constraint("uq_users_provider_subject", ["auth_provider", "provider_subject"])


def downgrade():
    for table in ("one_time_tokens", "oauth_states", "revoked_tokens", "refresh_sessions",
                  "membership_requests", "candidate_resumes"):
        op.drop_table(table)
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_provider_subject", type_="unique")
        for name in ("provider_subject", "auth_provider", "email_verified", "workspace_id"):
            batch.drop_column(name)
    for table, names in (("audit_logs", ("detail", "status_code", "workspace_id")),
                         ("context_build_status", ("unavailable_sources", "context_json", "revision", "workspace_id")),
                         ("candidates", ("profile_json", "workspace_id")),
                         ("jobs", ("workspace_id",)), ("match_results", ("workspace_id",)),
                         ("chat_history", ("workspace_id",))):
        with op.batch_alter_table(table) as batch:
            for name in names:
                batch.drop_column(name)
    op.drop_table("workspaces")
