from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./battle_room.db"
    session_expire_hours: int = 168

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
