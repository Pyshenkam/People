from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any

from argon2 import PasswordHasher
from fastapi import HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .settings import Settings

@dataclass(slots=True)
class AuthResult:
    authenticated: bool
    csrf_token: str

class LoginRateLimiter:
    def __init__(self, attempts: int, window_seconds: int) -> None:
        self.attempts = attempts
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, ip_key: str) -> deque[float]:
        bucket = self._failures[ip_key]
        cutoff = time.time() - self.window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        return bucket

    def ensure_allowed(self, ip_key: str) -> None:
        if len(self._prune(ip_key)) >= self.attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="登录尝试过多，请稍后再试。",
            )

    def record_failure(self, ip_key: str) -> None:
        self._prune(ip_key).append(time.time())

    def reset(self, ip_key: str) -> None:
        self._failures.pop(ip_key, None)

class AdminSecurity:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.serializer = URLSafeTimedSerializer(settings.session_secret, salt="museum-admin-session")
        self.password_hasher = PasswordHasher()
        self.rate_limiter = LoginRateLimiter(
            settings.login_rate_limit_attempts,
            settings.login_rate_limit_window_seconds,
        )

    def hash_password(self, password: str) -> str:
        return self.password_hasher.hash(password)

    def verify_password(self, password_hash: str, password: str) -> bool:
        try:
            return self.password_hasher.verify(password_hash, password)
        except Exception:
            return False

    def _cookie_kwargs(self) -> dict[str, Any]:
        return {
            "httponly": True,
            "samesite": "strict",
            "secure": False,
            "path": "/",
        }

    def _csrf_cookie_kwargs(self) -> dict[str, Any]:
        return {
            "httponly": False,
            "samesite": "strict",
            "secure": False,
            "path": "/",
        }

    def ensure_csrf_token(self, request: Request, response: Response) -> str:
        token = request.cookies.get(self.settings.csrf_cookie_name)
        if token and len(token) >= 16:
            return token
        token = secrets.token_urlsafe(24)
        self.set_csrf_cookie(response, token)
        return token

    def get_or_create_csrf_token(self, request: Request) -> tuple[str, bool]:
        token = request.cookies.get(self.settings.csrf_cookie_name)
        if token and len(token) >= 16:
            return token, False
        return secrets.token_urlsafe(24), True

    def set_csrf_cookie(self, response: Response, token: str) -> None:
        response.set_cookie(
            self.settings.csrf_cookie_name,
            token,
            **self._csrf_cookie_kwargs(),
        )

    def validate_csrf(self, request: Request) -> None:
        cookie_token = request.cookies.get(self.settings.csrf_cookie_name)
        header_token = request.headers.get("x-csrf-token")
        if not cookie_token or not header_token or cookie_token != header_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF 校验失败。",
            )

    def create_session(self, response: Response) -> None:
        payload = {
            "sub": "admin",
            "issued_at": int(time.time()),
        }
        response.set_cookie(
            self.settings.session_cookie_name,
            self.serializer.dumps(payload),
            max_age=self.settings.session_idle_seconds,
            **self._cookie_kwargs(),
        )

    def clear_session(self, response: Response) -> None:
        response.delete_cookie(self.settings.session_cookie_name, path="/")

    def read_session(self, request: Request) -> dict[str, Any] | None:
        raw = request.cookies.get(self.settings.session_cookie_name)
        if not raw:
            return None
        try:
            return self.serializer.loads(raw, max_age=self.settings.session_idle_seconds)
        except (BadSignature, SignatureExpired):
            return None

    def require_admin(self, request: Request) -> dict[str, Any]:
        session = self.read_session(request)
        if session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录。")
        return session

    def auth_status(self, request: Request, response: Response) -> AuthResult:
        csrf = self.ensure_csrf_token(request, response)
        return AuthResult(
            authenticated=self.read_session(request) is not None,
            csrf_token=csrf,
        )
