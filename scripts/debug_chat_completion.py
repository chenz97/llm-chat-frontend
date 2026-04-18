#!/usr/bin/env python3
"""Send a chat completions request like the frontend and print the raw result."""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def load_dotenv_api_key(path: str) -> str:
    env_path = Path(path)
    if not env_path.exists():
        raise ValueError(f'API key not provided and env file not found: {env_path}')

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[7:].strip()
        if '=' not in line:
            continue

        key, value = line.split('=', 1)
        if key.strip() != 'API_KEY':
            continue

        normalized = value.strip()
        if (
            len(normalized) >= 2
            and normalized[0] == normalized[-1]
            and normalized[0] in {"'", '"'}
        ):
            normalized = normalized[1:-1]

        if normalized:
            return normalized

        break

    raise ValueError(f'API_KEY not found in env file: {env_path}')


def resolve_chat_completions_endpoint(base_url: str) -> str:
    endpoint = base_url.rstrip('/')
    if not endpoint.endswith('/chat/completions'):
        if not endpoint.endswith('/v1'):
            endpoint += '/v1'
        endpoint += '/chat/completions'
    return endpoint


def load_request_payload(path: str) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        raise ValueError('Request payload must be a JSON object.')

    normalized = dict(payload)
    normalized['stream'] = True
    return normalized


def mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return '*' * len(api_key)
    return f'{api_key[:4]}...{api_key[-4:]}'


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Send a raw OpenAI-compatible chat completions request.'
    )
    parser.add_argument('--base-url', required=True, help='Provider base URL, e.g. https://api.openai.com/v1')
    parser.add_argument('--api-key', help='Bearer token used by the frontend; defaults to API_KEY from .env')
    parser.add_argument(
        '--env-file',
        default='.env',
        help='Env file used when --api-key is omitted (default: .env)'
    )
    parser.add_argument(
        '--request-file',
        required=True,
        help='Path to a JSON file containing the chat completions request body'
    )
    parser.add_argument(
        '--timeout',
        type=float,
        default=60.0,
        help='Socket timeout in seconds (default: 60)'
    )
    args = parser.parse_args()

    api_key = args.api_key or load_dotenv_api_key(args.env_file)
    endpoint = resolve_chat_completions_endpoint(args.base_url)
    payload = load_request_payload(args.request_file)
    request_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')

    http_request = urllib.request.Request(
        endpoint,
        data=request_bytes,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        },
    )

    print(f'POST {endpoint}')
    print(f'Authorization: Bearer {mask_api_key(api_key)}')
    print('Content-Type: application/json')
    print()
    print('Request body:')
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print()

    try:
        with urllib.request.urlopen(http_request, timeout=args.timeout) as response:
            print(f'Status: {response.status} {response.reason}')
            print('Response headers:')
            for key, value in response.headers.items():
                print(f'{key}: {value}')
            print()
            print('Raw response body:')
            sys.stdout.flush()

            while True:
                chunk = response.read(4096)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()

            print()
            return 0
    except urllib.error.HTTPError as error:
        print(f'Status: {error.code} {error.reason}')
        print('Response headers:')
        for key, value in error.headers.items():
            print(f'{key}: {value}')
        print()
        print('Raw response body:')
        body = error.read()
        if body:
            sys.stdout.buffer.write(body)
            sys.stdout.buffer.flush()
            print()
        return 1
    except urllib.error.URLError as error:
        print('Request failed before receiving an HTTP response.')
        print(f'URLError: {error!r}')
        if getattr(error, 'reason', None) is not None:
            print(f'Reason: {error.reason!r}')
        return 2
    except ssl.SSLError as error:
        print('TLS/SSL failure before receiving an HTTP response.')
        print(f'SSLError: {error!r}')
        return 3
    except Exception as error:  # pragma: no cover - debug helper
        print('Unexpected failure before receiving an HTTP response.')
        print(f'Exception: {error!r}')
        traceback.print_exc()
        return 4


if __name__ == '__main__':
    raise SystemExit(main())
