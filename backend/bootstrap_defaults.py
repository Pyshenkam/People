from __future__ import annotations

from app.security import AdminSecurity
from app.settings import Settings
from app.store import ConfigStore


def main() -> None:
    settings = Settings.from_env()
    security = AdminSecurity(settings)
    store = ConfigStore(settings.database_path)
    store.initialize(settings.default_config, security.hash_password(settings.admin_password))
    published = store.get_published()
    draft = store.get_draft()
    print(
        "Bootstrap complete. Preserved existing config state "
        f"(draft updated_by={draft.updated_by}, published version={published.version}, actor={published.actor})."
    )


if __name__ == "__main__":
    main()
