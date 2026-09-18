#!/usr/bin/env python3
"""Generate the narration recordings for every object in every language.

For each object in data/*.json the script builds the spoken text from the
title and the description (HTML stripped), synthesises it with a cloud TTS
voice, encodes the result into the single format the site ships — MP3, which
every browser plays including Safari/iOS — and finally points the `audio`
field of the matching data file at the new recording.

Naming follows the convention the app and tools/check-data.mjs already rely
on: the Belarusian original is `../assets/audio/<id>.mp3`, a translation is
`../assets/audio/<id>.<lang>.mp3`.
data files; app.js derives it by swapping the extension.

Engines
  elevenlabs  ElevenLabs multilingual v2 (key, the default). One voice reads
              all three languages, including Belarusian. Billing is per
              character, so a full run of all three languages costs the
              character count printed by --plan.
  edge        Free, no key. Microsoft Edge read-aloud voices. No Belarusian
              voice is offered any more, so it covers ru / en only.
  azure       Azure Speech (key). Same voices as `edge`, plus Belarusian
              (be-BY-AliaksandrNeural, be-BY-ValentynaNeural).
  google      Google Cloud TTS (key). `be-BY-Standard-A` for Belarusian.

Recording on the ElevenLabs website instead
  On a free account the API refuses the shared voice library and refuses to
  create voices, while the website itself imposes no such limit. The two halves
  of the job can therefore be split:
    --export-texts DIR   every object that still needs a recording, as
                         paste-ready <DIR>/<lang>/<id>.txt, which is also the
                         exact text the API would send. An object whose
                         recording already exists in assets/audio is left out,
                         and a text left over from an earlier export is removed
                         --file them with --force
    --import-audio DIR   take the downloads placed next to those texts as
                         <lang>/<id>.mp3 (wav/m4a/ogg also fine), encode the
                         shipped format, normalise loudness and point the data
                         files at the result
  Nothing else changes: the same naming, the same data patching, the same
  checks.

Settings for the keyed engines. Each may also be left as a file in
tools/.tmp/keys/<NAME> — that directory is ignored by git, so nothing has to
be exported into the session and nothing can reach a commit.
  ELEVENLABS_API_KEY, or one per language to spread the quota:
    ELEVENLABS_API_KEY_BE, ELEVENLABS_API_KEY_RU, ELEVENLABS_API_KEY_EN
  ELEVENLABS_VOICE_BE / _RU / _EN — a voice id, or several separated by
    commas to rotate narrators from object to object
  ELEVENLABS_MODEL_ID (default eleven_multilingual_v2)
Any of these may hold comma-separated values: several accounts for one
language are rotated from object to object, exactly like several voices.
  AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
  GOOGLE_TTS_API_KEY

No request ever exceeds 9500 characters, and a seam is never placed in the
middle of a word or of a thought: the narration is split between paragraphs
first, then between sentences, and only a sentence longer than a whole request
is cut between two words. Every chunk, and what it ends with, is listed by
--plan.

Examples
  python tools/make-audio.py --find-voices ru       # best voices per language
  python tools/make-audio.py --list-voices          # voices of the account
  python tools/make-audio.py --plan                 # jobs, characters, keys
  python tools/make-audio.py --voices "be=<id>,<id>;ru=<id>;en=<id>"
  python tools/make-audio.py --only lidski-zamak --force
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import html
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
AUDIO = ROOT / "assets" / "audio"
CACHE = ROOT / "tools" / ".tmp" / "tts"
SECRETS = ROOT / "tools" / ".tmp" / "keys"
# What a recording downloaded from the website may look like on disk.
INPUT_EXTENSIONS = (".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".flac")

SOURCES = ("sights", "enterprises", "people")
LANGS = ("be", "ru", "en")

# Voice per language for the engines that ship one voice per locale. The
# ElevenLabs voices are picked per language from the settings instead, because
# the multilingual model renders every language with whatever voice is given
# to it — see elevenlabs_voices().
VOICES = {
    "be": {
        "azure": "be-BY-AliaksandrNeural",
        "google": "be-BY-Standard-A",
    },
    "ru": {
        "edge": "ru-RU-DmitryNeural",
        "azure": "ru-RU-DmitryNeural",
        "google": "ru-RU-Wavenet-D",
    },
    "en": {
        "edge": "en-US-AndrewNeural",
        "azure": "en-US-AndrewNeural",
        "google": "en-US-Wavenet-D",
    },
}

# Engines that can actually speak a language, for the "nothing to do" message.
ENGINES = ("elevenlabs", "edge", "azure", "google")

# ElevenLabs falls back to Daniel, the documented v2 narrator, when no voice
# is configured for a language.
ELEVENLABS_DEFAULT_VOICE = "onwK4e9ZLuTAKqWW03F9"
ELEVENLABS_FORMAT = "mp3_44100_128"
ELEVENLABS_SETTINGS = {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0}
# A single ElevenLabs request takes at most 10 000 characters.
ELEVENLABS_LIMIT = 9500
# Some models reject the optional request fields (the language hint and the
# seam context). Once one is turned down, stop sending it rather than pay for a
# rejected request with every chunk.
REJECTED_OPTIONALS = {"yes": False}
# The other engines measure a request in bytes and Belarusian is two bytes a
# letter, so they need much smaller chunks.
CHUNK_LIMIT = {"edge": 2000, "azure": 3000, "google": 2000}
DEFAULT_CHUNK = 2000


def log(*args: object) -> None:
    print(*args, flush=True)


# The transcript is Cyrillic in places and a Windows console defaults to a
# legacy code page, which would turn it into mojibake.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def setting(name: str) -> str | None:
    """A setting from the environment, else from tools/.tmp/keys/<NAME>.

    tools/.tmp is git-ignored, which lets an API key be used without exporting
    it into the whole session (and without it ever reaching a commit).
    """
    value = os.environ.get(name)
    if value:
        return value.strip()
    path = SECRETS / name
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return None


def setting_list(name: str) -> list[str]:
    value = setting(name)
    return [part.strip() for part in value.split(",") if part.strip()] if value else []


def elevenlabs_keys(lang: str) -> list[str]:
    """The accounts to bill for a language, so its quota can span several keys."""
    return (setting_list(f"ELEVENLABS_API_KEY_{lang.upper()}")
            or setting_list("ELEVENLABS_API_KEY"))


def elevenlabs_key(lang: str) -> str | None:
    keys = elevenlabs_keys(lang)
    return keys[0] if keys else None


def mask(key: str | None) -> str:
    """A key as it may appear in the log: never in full, but still distinct."""
    if not key:
        return "(no key)"
    return f"{key[:4]}…{key[-4:]}" if len(key) > 10 else f"{key[:2]}…"


def elevenlabs_voices(lang: str) -> list[str]:
    """The configured voices for one language; several rotate per object."""
    voices = (setting_list(f"ELEVENLABS_VOICE_{lang.upper()}")
              or setting_list("ELEVENLABS_VOICE_ID"))
    return voices or [ELEVENLABS_DEFAULT_VOICE]


# ───────────────────────── text preparation ─────────────────────────

TAG_RE = re.compile(r"<[^>]+>")

# Abbreviations that TTS would otherwise spell out letter by letter. Kept to
# cases that are unambiguous in the data files.
ABBREVIATIONS = {
    "be": (
        (re.compile(r"\bгг\."), "гады"),
        (re.compile(r"\bг\."), "год"),
        (re.compile(r"\bст\."), "стагоддзя"),
        (re.compile(r"\bг\b(?=\s*\d)"), "год"),
    ),
    "ru": (
        (re.compile(r"\bгг\."), "годы"),
        (re.compile(r"\bг\."), "год"),
        (re.compile(r"\bвв\."), "века"),
        (re.compile(r"\bв\."), "век"),
    ),
    "en": (
        (re.compile(r"\bb\."), "born"),
        (re.compile(r"\bd\."), "died"),
    ),
}


def paragraphs(description: str) -> list[str]:
    """Split a description into plain-text paragraphs."""
    text = re.sub(r"</p\s*>", "\n\n", description, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text)
    # Smarten the punctuation TTS reads as a hard stop and drop the exotic
    # spaces that end up in the carousel copy.
    text = text.replace("\u00a0", " ").replace("\u2009", " ")
    text = unicodedata.normalize("NFC", text)
    out = []
    for part in text.split("\n"):
        part = re.sub(r"\s+", " ", part).strip()
        if part:
            out.append(part)
    return out


def spoken_text(obj: dict, lang: str) -> str:
    """Title + description as one speakable string."""
    chunks = [str(obj.get("title", "")).strip()]
    chunks.extend(paragraphs(str(obj.get("description", ""))))
    text = "\n\n".join(c for c in chunks if c)
    for pattern, replacement in ABBREVIATIONS.get(lang, ()):
        text = pattern.sub(replacement, text)
    return text


def cut_at_word(text: str, limit: int) -> tuple[str, str]:
    """Split off the longest prefix that fits and ends on a word boundary."""
    cut = text.rfind(" ", 0, limit + 1)
    if cut <= 0:
        # One single word longer than a whole request: nothing to align to.
        cut = limit
    return text[:cut].rstrip(), text[cut:].lstrip()


def split_long(part: str, limit: int) -> list[str]:
    """Break one paragraph that is longer than a single request allows.

    A seam is only ever placed where the narration can be resumed cleanly:
    after a full stop first, and otherwise between two words. A piece never
    begins or ends in the middle of a word, so the syllables on both sides of
    the seam are read as the words they are.
    """
    pieces: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?…])\s+", part):
        # A sentence that does not fit on its own — the seam has to fall
        # inside it, so it is cut between words instead of inside one.
        while len(sentence) > limit:
            if current:
                pieces.append(current)
                current = ""
            head, sentence = cut_at_word(sentence, limit)
            pieces.append(head)
        if current and len(current) + len(sentence) + 1 > limit:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}" if current else sentence
    if current:
        pieces.append(current)
    return pieces


def chunked(text: str, limit: int) -> list[str]:
    """The narration as requests of at most `limit` characters each.

    Paragraphs come first, so a seam usually falls between two thoughts, then
    sentences, and only then the inside of a sentence — between two words.
    """
    parts: list[str] = []
    for part in text.split("\n\n"):
        parts.extend(split_long(part, limit) if len(part) > limit else [part])
    blocks, current = [], ""
    for part in parts:
        if current and len(current) + len(part) + 2 > limit:
            blocks.append(current)
            current = part
        else:
            current = f"{current}\n\n{part}" if current else part
    if current:
        blocks.append(current)
    assert all(len(block) <= limit for block in blocks), \
        f"a chunk exceeded the {limit} character limit"
    return blocks


def chunk_report(block: str) -> dict:
    """What a chunk ends with, so a seam at the wrong place is visible."""
    return {
        "chars": len(block),
        "ends": "…" + " ".join(block.split()[-8:]),
    }


# ───────────────────────────── engines ─────────────────────────────

def synth_edge(text: str, lang: str, voice: str, key: str | None = None,
               context: dict | None = None) -> bytes:
    import edge_tts  # imported lazily: only this engine needs it

    async def run() -> bytes:
        communicate = edge_tts.Communicate(text, voice)
        return b"".join(chunk["data"] async for chunk in communicate.stream()
                        if chunk["type"] == "audio")

    return asyncio.run(run())


def post(url: str, data: bytes, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def elevenlabs_hint(code: int) -> str:
    """What a failed ElevenLabs call most likely means."""
    return {
        401: "the key was rejected",
        402: "the account cannot pay for this request — the plan may exclude "
             "API access, the monthly quota may be spent, or the voice may not "
             "be available on this tier",
        422: "the request was rejected as invalid",
        429: "rate limited — wait a moment and run again",
    }.get(code, "unexpected status")


def elevenlabs_send(url: str, payload: dict, headers: dict[str, str]) -> bytes:
    """POST one synthesis request, with a readable message when it fails."""
    try:
        return post(url, json.dumps(payload).encode("utf-8"), headers)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace").strip()
        raise RuntimeError(f"elevenlabs {error.code}: {elevenlabs_hint(error.code)} "
                           f"{detail[:200]}") from error


def synth_elevenlabs(text: str, lang: str, voice: str, key: str | None = None,
                     context: dict | None = None) -> bytes:
    key = key or elevenlabs_key(lang)
    if not key:
        raise RuntimeError(f"set ELEVENLABS_API_KEY_{lang.upper()} "
                           f"(or ELEVENLABS_API_KEY) — see the module docstring")
    model = setting("ELEVENLABS_MODEL_ID") or "eleven_multilingual_v2"
    url = (f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
           f"?output_format={ELEVENLABS_FORMAT}")
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {"text": text, "model_id": model, "voice_settings": ELEVENLABS_SETTINGS}
    if not REJECTED_OPTIONALS["yes"]:
        # language_code keeps Belarusian from being read with a Russian accent,
        # and the neighbours of a chunk let the model carry the melody over a
        # seam. Not every model accepts them, so a rejection is retried with the
        # required fields only — once, for the rest of the run.
        extras = {"language_code": lang}
        if context:
            extras["previous_text"] = context.get("previous")
            extras["next_text"] = context.get("next")
        try:
            return post(url, json.dumps({**payload, **extras}).encode("utf-8"), headers)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace").strip()
            if error.code not in (400, 422):
                raise RuntimeError(f"elevenlabs {error.code}: "
                                   f"{elevenlabs_hint(error.code)} "
                                   f"{detail[:200]}") from error
            REJECTED_OPTIONALS["yes"] = True
            log(f"note: the model turned down the language/seam hints "
                f"({detail[:140]}) — continuing without them")
    return elevenlabs_send(url, payload, headers)


def any_elevenlabs_key(lang: str | None = None) -> str | None:
    """The key of one language, or whichever account is configured."""
    if lang:
        return elevenlabs_key(lang)
    return (elevenlabs_key("be") or elevenlabs_key("ru") or elevenlabs_key("en"))


def elevenlabs_request(url: str, key: str) -> dict:
    request = urllib.request.Request(url, headers={"xi-api-key": key})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def configured_accounts() -> list[tuple[str, str]]:
    """Every configured key once, labelled with the language slot it came from."""
    found: list[tuple[str, str]] = []
    for lang in LANGS:
        for index, key in enumerate(elevenlabs_keys(lang), start=1):
            if all(key != seen for _, seen in found):
                found.append((f"{lang}#{index}", key))
    return found


def list_elevenlabs_voices() -> int:
    """Print the voices of every configured account, with their previews."""
    accounts = configured_accounts()
    if not accounts:
        raise SystemExit("set ELEVENLABS_API_KEY first (see the module docstring)")
    for label, key in accounts:
        log(f"== account {label} {mask(key)}")
        try:
            voices = elevenlabs_request("https://api.elevenlabs.io/v1/voices",
                                        key)["voices"]
        except Exception as error:  # noqa: BLE001 — one bad key must not hide the rest
            log(f"   unreadable: {error}")
            continue
        for voice in voices:
            labels = voice.get("labels") or {}
            details = " ".join(filter(None, (
                labels.get("gender"), labels.get("accent"), labels.get("use_case"),
                f"lang={labels['language']}" if labels.get("language") else None)))
            log(f"   {voice['voice_id']}  {voice.get('name', '?'):<30} {details:<44} "
                f"{voice.get('category', '')}")
            # Only the account's own voices matter here: on the free tier the
            # library ones are refused, so their previews would be a red herring.
            if voice.get("category") not in ("premade",):
                log(f"       preview {voice.get('preview_url', '-')}")
    log("\nkind='premade' voices ship with every account and are the only ones "
        "usable on the free tier; 'generated'/'cloned'/'professional' voices "
        "belong to the account")
    for lang in LANGS:
        log(f"{lang}: {', '.join(elevenlabs_voices(lang))}")
    return 0


def add_elevenlabs_voice(target: str, name: str | None = None) -> int:
    """Copy a voice-library voice into the account so it can be used by id.

    `target` is "<public_owner_id>/<voice_id>", the two values that
    --find-voices prints. A shared voice cannot be sent text until it has been
    added, and adding it costs nothing.
    """
    owner, _, voice = target.partition("/")
    if not owner or not voice:
        raise SystemExit("--add-voice expects <public_owner_id>/<voice_id>")
    key = any_elevenlabs_key()
    if not key:
        raise SystemExit("set ELEVENLABS_API_KEY first (see the module docstring)")
    added = json.loads(post(
        f"https://api.elevenlabs.io/v1/voices/add/{owner}/{voice}",
        json.dumps({"new_name": name or f"lidagid-{voice[:8]}"}).encode("utf-8"),
        {"xi-api-key": key, "Content-Type": "application/json"},
    ))
    log(f"added as {added['voice_id']}")
    return 0


def show_accounts() -> int:
    """Print the plan and the spent quota of every configured account."""
    accounts = configured_accounts()
    if not accounts:
        raise SystemExit("no ElevenLabs key configured (see the module docstring)")
    for label, key in accounts:
        try:
            sub = elevenlabs_request(
                "https://api.elevenlabs.io/v1/user/subscription", key)
        except Exception as error:  # noqa: BLE001 — report, do not crash
            log(f"{label} {mask(key)}: {error}")
            continue
        used = sub.get("character_count") or 0
        total = sub.get("character_limit") or 0
        log(f"{label} {mask(key)}: {sub.get('tier', '?')} tier — "
            f"{used} of {total} characters used, {max(0, total - used)} left")
    return 0


def find_elevenlabs_voices(lang: str) -> int:
    """Search the public voice library for narrators of one language.

    These are the voices other users published, which is where a good Russian
    narrator is found — the premade set is English only. Nothing here costs
    characters: pick from the preview_url links, then --add-voice the ones to
    keep and pass their new id to --voices.
    """
    key = any_elevenlabs_key(lang)
    if not key:
        raise SystemExit("set ELEVENLABS_API_KEY first (see the module docstring)")
    url = ("https://api.elevenlabs.io/v1/shared-voices"
           f"?language={lang}&page_size=40&include_custom_rates=true")
    found = elevenlabs_request(url, key).get("voices", [])
    # The library reports popularity as usage; sort the most used to the top.
    def popularity(voice: dict) -> int:
        return int(voice.get("usage_character_count_1y")
                   or voice.get("cloned_by_count") or voice.get("usage_count") or 0)

    for voice in sorted(found, key=popularity, reverse=True):
        details = " ".join(filter(None, (voice.get("gender"), voice.get("accent"),
                                        voice.get("use_case"))))
        log(f"{voice.get('voice_id', '?'):<24} {voice.get('name', '?'):<30} "
            f"{details:<34} {popularity(voice):>7}"
            f"{'  free' if voice.get('free_users_allowed') else '  tier'}"
            f"{'  added' if voice.get('is_added_by_user') else ''}")
        if voice.get("preview_url"):
            log(f"    preview {voice['preview_url']}")
            log(f"    add with --add-voice {voice.get('public_owner_id')}/"
                f"{voice.get('voice_id')}")
    log(f"\n{len(found)} library voices for {lang}; characters are spent only "
        f"when text is synthesised")
    return 0


def synth_azure(text: str, lang: str, voice: str, key: str | None = None,
                context: dict | None = None) -> bytes:
    key, region = setting("AZURE_SPEECH_KEY"), setting("AZURE_SPEECH_REGION")
    if not key or not region:
        raise RuntimeError("set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION")
    locale = {"be": "be-BY", "ru": "ru-RU", "en": "en-US"}[lang]
    # Azure caps one request at 64 KB of SSML, hence the small chunks.
    ssml = (
        f"<speak version='1.0' xml:lang='{locale}'>"
        f"<voice name='{voice}'><prosody rate='-4%'>{html.escape(text)}</prosody></voice>"
        f"</speak>"
    ).encode("utf-8")
    return post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        ssml,
        {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        },
    )


def synth_google(text: str, lang: str, voice: str, key: str | None = None,
                 context: dict | None = None) -> bytes:
    key = setting("GOOGLE_TTS_API_KEY")
    if not key:
        raise RuntimeError("set GOOGLE_TTS_API_KEY")
    payload = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": "-".join(voice.split("-")[:2]), "name": voice},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.96},
    }).encode("utf-8")
    raw = post(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={key}",
        payload,
        {"Content-Type": "application/json"},
    )
    return base64.b64decode(json.loads(raw)["audioContent"])


SYNTH = {
    "elevenlabs": synth_elevenlabs,
    "edge": synth_edge,
    "azure": synth_azure,
    "google": synth_google,
}


def voices_for(engine: str, lang: str) -> list[str]:
    """Voices to rotate through for one language (one entry is the norm)."""
    if engine == "elevenlabs":
        return elevenlabs_voices(lang)
    voice = VOICES.get(lang, {}).get(engine)
    return [voice] if voice else []


def synthesise(text: str, lang: str, engine: str, voice: str, cache: Path,
               key: str | None = None) -> bytes:
    """Synthesise `text`, reusing the cached raw audio when we already have it."""
    if cache.exists() and cache.stat().st_size:
        return cache.read_bytes()
    limit = (ELEVENLABS_LIMIT if engine == "elevenlabs"
             else CHUNK_LIMIT.get(engine, DEFAULT_CHUNK))
    blocks = chunked(text, limit)
    audio = b""
    for index, block in enumerate(blocks):
        # The end of the previous chunk and the start of the next one are handed
        # to the engine, so the melody carries over the seam instead of breaking
        # off mid thought.
        context = None
        if len(blocks) > 1:
            context = {
                "previous": blocks[index - 1][-600:] if index else None,
                "next": blocks[index + 1][:600] if index + 1 < len(blocks) else None,
            }
        audio += SYNTH[engine](block, lang, voice, key, context)
    if not audio:
        raise RuntimeError("the engine returned no audio")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(audio)
    return audio


# ───────────────────────────── encoding ─────────────────────────────

# Encoding targets speech, so mono and a modest bitrate are plenty and keep
# the repository small. MP3 is the only shipped format: it plays in every
# browser, Safari/iOS included, so there is no second copy to keep in sync.
MP3_ARGS = ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k"]
# One-pass loudness normalisation: the objects then sit at the same level as
# each other, which matters when the visitor walks from one to the next.
LOUDNESS = "loudnorm=I=-16:TP=-1.5:LRA=11"


def encode(raw: bytes, destination: Path, codec_args: list[str]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-i", "pipe:0", "-af", LOUDNESS, *codec_args, str(destination)],
        input=raw, capture_output=True,
    )
    if process.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {destination.name}: "
                           f"{process.stderr.decode('utf-8', 'replace').strip()}")


# ──────────────────────────── data patching ────────────────────────────

AUDIO_LINE = re.compile(r'^(\s*)"audio"\s*:\s*".*?",?\s*$')


def data_file(source: str, lang: str) -> Path:
    return DATA / (f"{source}.json" if lang == "be" else f"{source}.{lang}.json")


def audio_path(obj_id: str, lang: str) -> str:
    suffix = "" if lang == "be" else f".{lang}"
    return f"../assets/audio/{obj_id}{suffix}.mp3"


def set_audio_field(path: Path, obj_id: str, value: str | None) -> bool:
    """Add, update or drop the "audio" line of one object.

    The data files are hand-edited and mix CRLF with LF — sometimes inside a
    single file — so they are patched line by line instead of being
    re-serialised. Splitting on "\n" alone keeps a trailing "\r" attached to
    its line, and the inserted line copies the ending of the line it follows,
    so the diff stays exactly one line wide.

    Only the block of this very object is touched: it ends at the next line
    that opens a new one at indent 0-2, and a block that cannot be delimited
    is an error rather than "everything that follows".
    """
    raw = path.read_text(encoding="utf-8", newline="")
    lines = raw.split("\n")

    start = None
    for index, line in enumerate(lines):
        if re.match(rf'^\s*"id"\s*:\s*"{re.escape(obj_id)}"\s*,\s*$', line):
            start = index
            break
    if start is None:
        raise RuntimeError(f"{path.name}: object {obj_id} not found")

    end = len(lines)
    for index in range(start + 1, len(lines)):
        # The object closes on the first line that opens a new one at indent 2
        # ("  }," / "  }" / "  ]") — everything before that belongs to this
        # object. The comma matters: forgetting it made the block run to the
        # end of the file, and an anchor from a later object was then patched
        # instead of this one.
        if re.match(r"^\s{0,2}[}\]]\s*,?\s*$", lines[index]):
            end = index
            break

    body = lines[start:end]
    if any(re.match(r'^\s*"id"\s*:', line) for line in body[1:]):
        raise RuntimeError(f"{path.name}: the block of {obj_id} could not be "
                           f"delimited — refusing to patch it")
    existing = next((i for i, line in enumerate(body) if AUDIO_LINE.match(line)), None)

    if value is None:
        if existing is None:
            return False
        del body[existing]
    else:
        entry = f'    "audio": {json.dumps(value, ensure_ascii=False)},'
        if existing is not None:
            if body[existing].strip() == entry.strip():
                return False
            body[existing] = body[existing][:len(body[existing]) - len(body[existing].lstrip())] \
                + entry.lstrip()
        else:
            anchor = next((i for i, line in enumerate(body)
                           if re.match(r'^\s*"image"\s*:', line)), None)
            body.insert(anchor + 1 if anchor is not None else len(body),
                        entry + ("\r" if anchor is not None and body[anchor].endswith("\r") else ""))

    path.write_text("\n".join(lines[:start] + body + lines[end:]),
                    encoding="utf-8", newline="")
    return True


def load_objects(source: str, lang: str) -> list[dict]:
    return json.loads(data_file(source, lang).read_text(encoding="utf-8"))


def show_path(path: Path) -> str:
    """A path the way the log prints it: relative to the repository if possible."""
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def export_texts(target: Path, force: bool = False) -> int:
    """Write the narration of every object that still needs a recording.

    An object that already has both files in assets/audio is skipped, and a
    text left over from an earlier export is deleted: recording it again would
    only spend characters on a duplicate of what the guide already plays.
    """
    rows: list[tuple[str, str, str, int, Path]] = []
    skipped: list[str] = []
    removed = 0
    for source in SOURCES:
        for lang in LANGS:
            for obj in load_objects(source, lang):
                obj_id = obj["id"]
                path = target / lang / f"{obj_id}.txt"
                suffix = "" if lang == "be" else f".{lang}"
                recorded = (AUDIO / f"{obj_id}{suffix}.mp3").exists()
                if recorded and not force:
                    skipped.append(f"{lang} {obj_id}")
                    if path.exists():
                        path.unlink()
                        removed += 1
                    continue
                text = spoken_text(obj, lang)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text + "\n", encoding="utf-8")
                rows.append((lang, source, obj_id, len(text), path))
    (target / "index.csv").write_text(
        "lang,source,id,characters,file\n" + "\n".join(
            f"{lang},{source},{obj_id},{chars},{path.name}"
            for lang, source, obj_id, chars, path in rows) + "\n",
        encoding="utf-8")
    for lang in LANGS:
        part = [row for row in rows if row[0] == lang]
        log(f"  {lang}: {len(part)} texts, {sum(row[3] for row in part)} characters")
    log(f"\n{len(rows)} texts to record; {len(skipped)} objects already have a "
        f"recording ({removed} leftover texts removed)")
    if skipped:
        log("skipped: " + ", ".join(skipped))
    log(f"written to {show_path(target)}: paste the text into the website, "
        f"then save the download in the same folder as <id>.mp3")
    return 0


def find_recording(directory: Path, obj_id: str, lang: str) -> Path | None:
    """The recording of one object: <id>.<ext> or <id>.<lang>.<ext>.

    The language-suffixed name comes first because that is how a translation
    arrives, next to the text exported for it.
    """
    for stem in (f"{obj_id}.{lang}", obj_id):
        for extension in INPUT_EXTENSIONS:
            path = directory / f"{stem}{extension}"
            if path.exists():
                return path
    return None


def import_audio(directory: Path) -> int:
    """Install recordings made on the website and point the data files at them."""
    if not directory.is_dir():
        raise SystemExit(f"{directory} is not a directory")
    installed = missing = 0
    for source in SOURCES:
        for lang in LANGS:
            for obj in load_objects(source, lang):
                obj_id = obj["id"]
                recording = find_recording(directory / lang, obj_id, lang)
                if recording is None:
                    missing += 1
                    continue
                suffix = "" if lang == "be" else f".{lang}"
                target = AUDIO / f"{obj_id}{suffix}.mp3"
                # Whatever the website gives us — mp3, wav, m4a — is encoded to
                # the shipped format and levelled like the API path, so a
                # hand-made recording is indistinguishable in the player.
                encode(recording.read_bytes(), target, MP3_ARGS)
                set_audio_field(data_file(source, lang), obj_id,
                                audio_path(obj_id, lang))
                installed += 1
                log(f"  ok    {lang} {source}/{obj_id}  from {recording.name}  "
                    f"{target.stat().st_size // 1024} kB")
    log(f"\n{installed} installed, {missing} objects still without a recording")
    if installed:
        log("now run: node tools/check-assets.mjs && node tools/check-data.mjs")
    return 0


def parse_voices(spec: str | None) -> dict[str, list[str]]:
    """Parse "be=<id>,<id>;ru=<id>" into the voices of each language."""
    overrides: dict[str, list[str]] = {}
    for group in (spec or "").split(";"):
        if not group.strip():
            continue
        lang, separator, ids = group.partition("=")
        lang = lang.strip()
        if lang not in LANGS:
            raise SystemExit(f"--voices: '{lang}' is not one of {', '.join(LANGS)}")
        if not separator:
            raise SystemExit(f"--voices: expected '{lang}=<voice id>[,<voice id>]'")
        overrides[lang] = [i.strip() for i in ids.split(",") if i.strip()]
    return overrides


def planned_state(job: dict, args) -> str:
    """What a run would do with one object: have / cached / generate.

    "have" means the recording is already in assets/audio, "cached" means only
    the encoding step is left, and "generate" is the one state that sends a
    request and therefore spends characters of the account.
    """
    if job["have"] and not args.force:
        return "have"
    if job["cache"].exists() and not args.force:
        return "cached"
    return "generate"


def summarise(jobs: list[dict], args) -> None:
    """Per-language totals: how much is left to do and which account pays.

    Each language may sit on its own account, and one language may span several
    accounts, so the characters are also added up per account — that is the
    number to compare with each account's quota.
    """
    log("")
    rows: dict[str, dict] = {}
    for job in jobs:
        row = rows.setdefault(job["lang"], {"objects": 0, "pending": 0, "chars": 0,
                                             "requests": 0, "billed": 0, "voices": [],
                                             "accounts": {}})
        state = planned_state(job, args)
        row["objects"] += 1
        row["chars"] += job["chars"]
        row["requests"] += len(job["chunks"])
        if job["voice"] not in row["voices"]:
            row["voices"].append(job["voice"])
        if state != "have":
            row["pending"] += 1
        if state == "generate":
            row["billed"] += job["chars"]
            account = mask(job["key"]) if args.engine == "elevenlabs" else args.engine
            row["accounts"][account] = row["accounts"].get(account, 0) + job["chars"]
    for lang, row in rows.items():
        if args.engine != "elevenlabs":
            key = "not needed"
        else:
            key = "set" if elevenlabs_keys(lang) else "MISSING"
        log(f"{lang}: {row['pending']} of {row['objects']} objects to do, "
            f"{row['chars']} characters in {row['requests']} requests, key {key}")
        log(f"    voices: {'  '.join(row['voices'])}")
        if row["accounts"]:
            log(f"    accounts: "
                + ",  ".join(f"{k} → {v} chars" for k, v in row["accounts"].items()))
    log("characters to synthesise per language:")
    for lang, row in rows.items():
        log(f"    {lang}: {row['billed']}")
    log(f"    total: {sum(r['billed'] for r in rows.values())} characters "
        f"of {sum(r['pending'] for r in rows.values())} objects")


def write_plan(jobs: list[dict], args, limit: int) -> int:
    """List every request of a run and save it as tools/.tmp/audio-plan.json."""
    for job in jobs:
        log(f"  {planned_state(job, args):<8} {job['lang']} {job['source']}/{job['id']}  "
            f"{job['chars']} chars in {len(job['chunks'])} req  {job['voice']}")
    summarise(jobs, args)
    manifest = ROOT / "tools" / ".tmp" / "audio-plan.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({
        "engine": args.engine,
        "request_limit": limit,
        "jobs": [{**{key: (str(value.relative_to(ROOT)).replace("\\", "/")
                          if isinstance(value, Path) else value)
                     for key, value in job.items() if key not in ("text", "have")},
                   "state": planned_state(job, args)}
                 for job in jobs],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"\nplan written to {manifest.relative_to(ROOT)}")
    return 0


# ─────────────────────────────── driver ───────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", default="elevenlabs", choices=ENGINES)
    parser.add_argument("--langs", default="be,ru,en",
                        help="comma-separated subset of be,ru,en (default: all three)")
    parser.add_argument("--sources", default=",".join(SOURCES),
                        help=f"comma-separated subset of {','.join(SOURCES)}")
    parser.add_argument("--only", default=None,
                        help="only this object id (repeatable, comma-separated)")
    parser.add_argument("--force", action="store_true",
                        help="re-synthesise and re-encode even if the files exist")
    parser.add_argument("--dry-run", action="store_true",
                        help="list what would be generated, write nothing")
    parser.add_argument("--list-voices", action="store_true",
                        help="print the voices of the ElevenLabs accounts and exit")
    parser.add_argument("--find-voices", default=None, metavar="LANG",
                        help="list the voice-library narrators of one language and exit")
    parser.add_argument("--add-voice", default=None, metavar="OWNER/VOICE",
                        help="copy a voice-library voice into the account and exit")
    parser.add_argument("--accounts", action="store_true",
                        help="show the plan and the spent quota of each account and exit")
    parser.add_argument("--export-texts", default=None, metavar="DIR",
                        help="write the narration of every object as plain text and exit")
    parser.add_argument("--import-audio", default=None, metavar="DIR",
                        help="install recordings named <DIR>/<lang>/<id>.mp3 and exit")
    parser.add_argument("--voice", default=None,
                        help="one voice id for every language, overriding the settings")
    parser.add_argument("--name", default=None,
                        help="name to store a voice from --add-voice under")
    parser.add_argument("--voices", default=None, metavar="SPEC",
                        help='voices per language, e.g. "be=<id>,<id>;ru=<id>;en=<id>"')
    parser.add_argument("--plan", action="store_true",
                        help="print every request that a run would make and write "
                             "tools/.tmp/audio-plan.json")
    args = parser.parse_args()

    if args.list_voices:
        return list_elevenlabs_voices()
    if args.find_voices:
        return find_elevenlabs_voices(args.find_voices)
    if args.add_voice:
        return add_elevenlabs_voice(args.add_voice, args.name)
    if args.accounts:
        return show_accounts()
    if args.export_texts:
        return export_texts(Path(args.export_texts), args.force)
    if args.import_audio:
        return import_audio(Path(args.import_audio))

    langs = [l for l in args.langs.split(",") if l]
    sources = [s for s in args.sources.split(",") if s]
    only = set(filter(None, (args.only or "").split(",")))
    overrides = parse_voices(args.voices)

    def voices_of(lang: str) -> list[str]:
        return overrides.get(lang) or voices_for(args.engine, lang)

    if args.engine != "elevenlabs":
        unusable = [l for l in langs if not voices_of(l)]
        if unusable:
            alternates = [e for e in ENGINES
                          if all(voices_for(e, l) for l in unusable) and e != args.engine]
            raise SystemExit(
                f"engine '{args.engine}' has no voice for: {', '.join(unusable)}\n"
                f"engines that do: {', '.join(alternates) or 'none'}"
            )

    # The jobs are collected first: --plan can then show exactly what a run
    # costs, and a missing key is reported before anything is generated. Voices
    # rotate by an object's position inside its language, so a narrator is
    # assigned to the same object on every run.
    limit = (ELEVENLABS_LIMIT if args.engine == "elevenlabs"
             else CHUNK_LIMIT.get(args.engine, DEFAULT_CHUNK))
    jobs: list[dict] = []
    positions: dict[str, int] = {}
    for source in sources:
        for lang in langs:
            voices = voices_of(lang)
            if not voices:
                raise SystemExit(f"no voice configured for '{lang}'")
            keys = elevenlabs_keys(lang) if args.engine == "elevenlabs" else []
            for obj in load_objects(source, lang):
                if only and obj["id"] not in only:
                    continue
                index = positions.get(lang, 0)
                positions[lang] = index + 1
                text = spoken_text(obj, lang)
                suffix = "" if lang == "be" else f".{lang}"
                recording = AUDIO / f"{obj['id']}{suffix}.mp3"
                blocks = chunked(text, limit)
                jobs.append({
                    "lang": lang,
                    "source": source,
                    "id": obj["id"],
                    "chars": len(text),
                    "chunks": [chunk_report(block) for block in blocks],
                    "voice": args.voice or voices[index % len(voices)],
                    # Several accounts for one language are rotated the same way
                    # as the voices, so no single account has to cover it all.
                    "key": keys[index % len(keys)] if keys else None,
                    "recording": recording,
                    "cache": CACHE / f"{obj['id']}{suffix}.raw",
                    "file": data_file(source, lang),
                    "text": text,
                    "have": recording.exists(),
                })

    if args.plan:
        return write_plan(jobs, args, limit)

    if args.engine == "elevenlabs" and not args.dry_run:
        # Bail out before the first request instead of half way through the set.
        missing = sorted({job["lang"] for job in jobs
                          if (args.force or not job["cache"].exists())
                          and not elevenlabs_keys(job["lang"])})
        if missing:
            raise SystemExit(f"no ElevenLabs key for: {', '.join(missing)} — set "
                             f"ELEVENLABS_API_KEY_{missing[0].upper()} "
                             f"(see the module docstring)")

    made = skipped = 0
    started = time.time()
    for job in jobs:
        lang = job["lang"]
        label = f"{lang} {job['source']}/{job['id']}"
        state = planned_state(job, args)
        if state == "have":
            if not args.dry_run:
                set_audio_field(job["file"], job["id"], audio_path(job["id"], lang))
            skipped += 1
            log(f"  have  {label}")
            continue
        if args.dry_run:
            log(f"  {state}  {label}  {job['chars']} chars  {job['voice']}")
            continue
        raw = synthesise(job["text"], lang, args.engine, job["voice"], job["cache"],
                         job["key"])
        encode(raw, job["recording"], MP3_ARGS)
        set_audio_field(job["file"], job["id"], audio_path(job["id"], lang))
        made += 1
        log(f"  ok    {label}  {job['chars']} chars  {job['voice']}  "
            f"{job['recording'].stat().st_size // 1024} kB")

    summarise(jobs, args)
    if args.dry_run:
        log("\ndry run — nothing was written")
    else:
        log(f"\n{made} generated, {skipped} already present, "
            f"{time.time() - started:.0f}s")
        log("now run: node tools/check-assets.mjs && node tools/check-data.mjs")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
