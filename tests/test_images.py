import asyncio
import base64
import io

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageDraw
from starlette.datastructures import Headers

from rb_client.images import load_image, read_image, to_rgb


def _upload(data: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename="test.bin",
        headers=Headers({"content-type": content_type}),
    )


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _open_png(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


@pytest.mark.parametrize(
    "mode",
    ["L", "LA", "P", "PA", "I", "1", "YCbCr", "HSV", "LAB", "CMYK", "RGBA", "RGB"],
)
def test_to_rgb_always_returns_rgb(mode: str) -> None:
    image = to_rgb(Image.new(mode, (8, 8)))
    assert image.mode == "RGB"


def test_to_rgb_keeps_rgb_passthrough() -> None:
    source = Image.new("RGB", (4, 4), (10, 20, 30))
    result = to_rgb(source)
    assert result is source


def test_to_rgb_composites_rgba_on_white() -> None:
    transparent = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    result = to_rgb(transparent)
    assert result.mode == "RGB"
    assert result.getpixel((0, 0)) == (255, 255, 255)


def test_to_rgb_keeps_black_content_readable_on_transparent_background() -> None:
    image = Image.new("RGBA", (160, 50), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((10, 10, 60, 40), fill=(0, 0, 0, 255))
    result = to_rgb(image)
    assert result.getpixel((35, 25)) == (0, 0, 0), "opaque black pixels must survive"
    assert result.getpixel((150, 45)) == (255, 255, 255), "transparent background must become white"


def test_to_rgb_composites_rgba_matching_pil() -> None:
    image = Image.new("RGBA", (4, 4), (255, 0, 0, 128))
    result = to_rgb(image)
    assert result.getpixel((0, 0)) == (255, 127, 127)


def test_to_rgb_palette_with_transparency_marker() -> None:
    palette = Image.new("P", (16, 16))
    palette.info["transparency"] = 5
    result = to_rgb(palette)
    assert result.mode == "RGB"


def test_to_rgb_opaque_palette() -> None:
    palette = Image.new("P", (8, 8))
    result = to_rgb(palette)
    assert result.mode == "RGB"


def test_read_image_transparent_png_comes_out_opaque_rgb() -> None:
    transparent = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    draw = ImageDraw.Draw(transparent)
    draw.rectangle((10, 10, 60, 45), fill=(0, 0, 0, 255))
    result = _open_png(asyncio.run(read_image(_upload(_png_bytes(transparent), "image/png"))))
    assert result.mode == "RGB"
    assert result.getpixel((35, 30)) == (0, 0, 0)
    assert result.getpixel((90, 90)) == (255, 255, 255)


def test_read_image_cmyk_jpeg() -> None:
    cmyk = Image.new("CMYK", (32, 32), (0, 0, 0, 0))
    buffer = io.BytesIO()
    cmyk.save(buffer, format="JPEG")
    result = _open_png(asyncio.run(read_image(_upload(buffer.getvalue(), "image/jpeg"))))
    assert result.mode == "RGB"


def test_read_image_grayscale() -> None:
    gray = Image.new("L", (16, 16), 128)
    result = _open_png(asyncio.run(read_image(_upload(_png_bytes(gray), "image/png"))))
    assert result.mode == "RGB"
    assert result.getpixel((0, 0)) == (128, 128, 128)


def test_read_image_corrupt_raises_400() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(read_image(_upload(b"not an image at all", "image/png")))
    assert exc.value.status_code == 400


def test_read_image_unsupported_type_raises_415() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(read_image(_upload(b"anything", "text/plain")))
    assert exc.value.status_code == 415


def test_read_image_too_large_raises_413() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(read_image(_upload(b"\x00" * (15 * 1024 * 1024 + 1024), "image/png")))
    assert exc.value.status_code == 413


def test_load_image_downscales_large_images() -> None:
    large = Image.new("RGB", (3000, 100), (0, 0, 0))
    mime, encoded = asyncio.run(load_image(_upload(_png_bytes(large), "image/png")))
    assert mime == "image/png"
    result = _open_png(base64.b64decode(encoded))
    assert max(result.size) <= 2000


def test_load_image_keeps_small_images() -> None:
    small = Image.new("RGB", (640, 480), (10, 20, 30))
    _, encoded = asyncio.run(load_image(_upload(_png_bytes(small), "image/png")))
    result = _open_png(base64.b64decode(encoded))
    assert result.size == (640, 480)
    assert result.getpixel((0, 0)) == (10, 20, 30)