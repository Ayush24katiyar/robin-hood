from pydantic import BaseModel


class ModelInput(BaseModel):
    prompt: str
    system: str | None = None
    temperature: float | None = None


class ModelOutput(BaseModel):
    response: str