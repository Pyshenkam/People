"""数字人计数表 - 记录点击开始对话次数"""

import asyncio
import logging
import os
from functools import partial

import pymysql

logger = logging.getLogger("counter")

_MYSQL_CONFIG = {
    "host": os.getenv("COUNTER_MYSQL_HOST", "115.120.248.123"),
    "port": int(os.getenv("COUNTER_MYSQL_PORT", "3306")),
    "user": os.getenv("COUNTER_MYSQL_USER", "root"),
    "password": os.getenv("COUNTER_MYSQL_PASSWORD", "rootpassword"),
    "database": os.getenv("COUNTER_MYSQL_DB", "kjg_num"),
    "charset": "utf8mb4",
}


def _insert_record(session_id: str, client_id: str | None) -> None:
    """同步插入，在线程池中执行"""
    try:
        conn = pymysql.connect(**_MYSQL_CONFIG)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO digital_human_count (session_id, client_id) VALUES (%s, %s)",
                (session_id, client_id),
            )
        conn.commit()
        conn.close()
        logger.info("counter_record session_id=%s client_id=%s", session_id, client_id)
    except Exception:
        logger.exception("counter_record_failed session_id=%s", session_id)


async def record_start_session(session_id: str, client_id: str | None = None) -> None:
    """在数字人计数表中插入一条记录（不阻塞事件循环）"""
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, partial(_insert_record, session_id, client_id))
