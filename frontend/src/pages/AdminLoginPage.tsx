import { Alert, Button, Card, Form, Input, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminSession, loginAdmin } from "../lib/api";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <Card className="admin-login-card">
        <Typography.Text className="eyebrow">ADMIN ACCESS</Typography.Text>
        <Typography.Title level={2}>后台登录</Typography.Title>
        <Typography.Paragraph>
          每次进入后台都需要输入管理员密码。登录后可以修改提示词、人设、欢迎语、熊猫讲解音色和空闲超时。
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setLoading(true);
            setError(null);
            try {
              await loginAdmin(values.password, csrfToken);
              message.success("登录成功");
              void navigate("/admin", { replace: true });
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : "登录失败。");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item
            label="管理员密码"
            name="password"
            rules={[{ required: true, message: "请输入管理员密码" }]}
          >
            <Input.Password autoFocus autoComplete="current-password" size="large" />
          </Form.Item>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Button type="primary" htmlType="submit" size="large" loading={loading} block>
            进入后台
          </Button>
        </Form>
      </Card>
    </main>
  );
}
