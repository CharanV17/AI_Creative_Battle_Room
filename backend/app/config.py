from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./battle_room.db"
    session_expire_hours: int = 168
    job_provider: str = "mock"
    job_timeout_seconds: int = 30
    mock_provider_delay_seconds: float = 2.0
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
