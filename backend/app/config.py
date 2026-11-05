from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = f"sqlite:///{ROOT / 'backend' / 'hubbro.db'}"
    storage_dir: Path = ROOT / "storage"

    # mock — тестовые заказы без Авито; live — настоящий API (нужна Доставка для бизнеса)
    avito_mode: str = "mock"
    avito_client_id: str = ""
    avito_client_secret: str = ""
    sync_interval_sec: int = 300

    # Только для локальной разработки, на сервере задать в .env
    admin_email: str = "admin@hubbro.local"
    admin_password: str = "admin"
    seed_demo: bool = True

    token_ttl_hours: int = 24 * 7
    station_online_sec: int = 30
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
