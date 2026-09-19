import base64
import io

from fastapi import HTTPException, UploadFile
from PIL import Image

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_SIDE = 2000
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif"}

WHITE_BACKGROUND = (255, 255, 255, 255)


def to_rgb(image: Image.Image) -> Image.Image:
    if image.mode == "RGB":
        return image
    if image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, WHITE_BACKGROUND)
        return Image.alpha_composite(background, rgba).convert("RGB")
    return image.convert("RGB")


async def read_image(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 15 MB).")

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc

    rgb_image = to_rgb(image)

    buffer = io.BytesIO()
    rgb_image.save(buffer, format="PNG")
    return buffer.getvalue()


async def load_image(file: UploadFile) -> tuple[str, str]:
    png = await read_image(file)
    image = Image.open(io.BytesIO(png))

    if max(image.size) > MAX_IMAGE_SIDE:
        image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return "image/png", encoded