import { Button, Form, Input, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminSession, loginAdmin } from "../lib/api";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    void fetchAdminSession().then((status) => {
      setCsrfToken(status.csrf_token);
      if (status.authenticated) {
        void navigate("/admin", { replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="admin-shell">
      <div className={`login-box${shake ? " login-box--shake" : ""}`} onAnimationEnd={() => setShake(false)}>
        <div className="login-box__icon">🔒</div>
        <h2 className="login-box__title">管理后台</h2>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setLoading(true);
            setError(null);
            try {
              await loginAdmin(values.password, csrfToken);
              message.success("登录成功");
              void navigate("/admin", { replace: true });
            } catch {
              setError("密码错误，请重试");
              setShake(true);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              autoFocus
              autoComplete="current-password"
              size="large"
              placeholder="输入管理密码"
              status={error ? "error" : undefined}
            />
          </Form.Item>
          {error ? <p className="login-box__error">{error}</p> : null}
          <Button type="primary" htmlType="submit" size="large" loading={loading} block>
            进入
          </Button>
        </Form>
        <button className="login-box__back" type="button" onClick={() => void navigate("/", { replace: true })}>
          ← 返回游戏
        </button>
      </div>
    </main>
  );
}
