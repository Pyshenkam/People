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
    if published.config.model_dump(mode="json") == settings.default_config.model_dump(mode="json"):
        print("Default config already matches current published version.")
        return

    store.save_draft(settings.default_config, updated_by="startup-script")
    new_published = store.publish_draft("startup-script")
    print(f"Published startup defaults as version {new_published.version}.")


if __name__ == "__main__":
    main()
