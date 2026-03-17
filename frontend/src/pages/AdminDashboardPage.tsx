import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminSession,
  fetchConfigBundle,
  fetchHistory,
  logoutAdmin,
  publishDraft,
  resetRealtimeSession,
  updateDraftConfig,
} from "../lib/api";
import type { ConfigBundle, ConfigHistoryItem, MuseumConfig } from "../types/api";

const speakerOptions = [
  "zh_female_vv_jupiter_bigtts",
  "zh_female_xiaohe_jupiter_bigtts",
  "zh_male_yunzhou_jupiter_bigtts",
  "zh_male_xiaotian_jupiter_bigtts",
];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<MuseumConfig>();
  const [csrfToken, setCsrfToken] = useState("");
  const [bundle, setBundle] = useState<ConfigBundle | null>(null);
  const [history, setHistory] = useState<ConfigHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetchAdminSession();
      setCsrfToken(session.csrf_token);
      if (!session.authenticated) {
        void navigate("/admin/login", { replace: true });
        return;
      }
      const [configBundle, configHistory] = await Promise.all([fetchConfigBundle(), fetchHistory()]);
      setBundle(configBundle);
      setHistory(configHistory);
      form.setFieldsValue(configBundle.draft.config);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "后台加载失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const currentFamily = Form.useWatch("model_family", form);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Typography.Text className="eyebrow">ADMIN CONSOLE</Typography.Text>
          <Typography.Title level={2}>数字人后台配置</Typography.Title>
          <Typography.Paragraph>
            草稿保存后不会影响当前访客。只有点击发布后，下一次访客开始对话时才会生效。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button
            onClick={async () => {
              await logoutAdmin(csrfToken);
              void navigate("/admin/login", { replace: true });
            }}
          >
            退出登录
          </Button>
          <Button
            danger
            onClick={async () => {
              await resetRealtimeSession(csrfToken);
              message.success("已尝试关闭当前访客会话");
            }}
          >
            重置当前会话
          </Button>
        </Space>
      </header>

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <div className="admin-grid">
        <Card loading={loading} title="草稿配置" className="admin-card">
          <Form
            layout="vertical"
            form={form}
            onFinish={async (values) => {
              try {
                await updateDraftConfig(values, csrfToken);
                message.success("草稿已保存");
                await refresh();
              } catch (requestError) {
                message.error(requestError instanceof Error ? requestError.message : "保存失败");
              }
            }}
          >
            <div className="form-grid">
              <Form.Item label="展示标题" name="display_title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="展示副标题" name="display_subtitle" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="GLB 地址" name="avatar_url">
                <Input placeholder="可填本地静态路径或可访问 URL" />
              </Form.Item>
              <Form.Item label="空闲超时（秒）" name="idle_timeout_sec" rules={[{ required: true }]}>
                <InputNumber min={15} max={600} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="模型家族" name="model_family" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "O", label: "O" },
                    { value: "O2.0", label: "O2.0" },
                    { value: "SC", label: "SC" },
                    { value: "SC2.0", label: "SC2.0" },
                  ]}
                />
              </Form.Item>
              <Form.Item label="模型标识" name="model">
                <Input placeholder="可留空使用上游默认模型" />
              </Form.Item>
              <Form.Item label="音色" name="speaker" rules={[{ required: true }]}>
                <Select options={speakerOptions.map((value) => ({ value, label: value }))} />
              </Form.Item>
              <Form.Item label="欢迎语" name="welcome_text" rules={[{ required: true }]}>
                <Input.TextArea rows={4} />
              </Form.Item>
              <Form.Item label="角色名称" name="bot_name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="城市" name={["location", "city"]} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              {(currentFamily === "O" || currentFamily === "O2.0") && (
                <>
                  <Form.Item label="System Role" name="system_role" rules={[{ required: true }]}>
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Form.Item label="Speaking Style" name="speaking_style" rules={[{ required: true }]}>
                    <Input.TextArea rows={4} />
                  </Form.Item>
                </>
              )}
              {(currentFamily === "SC" || currentFamily === "SC2.0") && (
                <Form.Item label="Character Manifest" name="character_manifest" rules={[{ required: true }]}>
                  <Input.TextArea rows={8} />
                </Form.Item>
              )}
              <Form.Item label="严格审核" name="strict_audit" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="识别退出意图" name="enable_user_query_exit" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <Space>
              <Button type="primary" htmlType="submit">
                保存草稿
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await publishDraft(csrfToken);
                    message.success("已发布，下一次会话生效");
                    await refresh();
                  } catch (requestError) {
                    message.error(requestError instanceof Error ? requestError.message : "发布失败");
                  }
                }}
              >
                发布到下一次会话
              </Button>
            </Space>
          </Form>
        </Card>

        <Card loading={loading} title="当前已发布" className="admin-card">
          {bundle ? (
            <div className="published-summary">
              <p>版本：v{bundle.published.version}</p>
              <p>角色：{bundle.published.config.bot_name}</p>
              <p>音色：{bundle.published.config.speaker}</p>
              <p>超时：{bundle.published.config.idle_timeout_sec} 秒</p>
              <p>欢迎语：{bundle.published.config.welcome_text}</p>
            </div>
          ) : null}
        </Card>

        <Card loading={loading} title="发布历史" className="admin-card admin-card--wide">
          <Table
            rowKey="version"
            pagination={false}
            dataSource={history}
            columns={[
              { title: "版本", dataIndex: "version", width: 90 },
              { title: "角色", render: (_, record) => record.config.bot_name },
              { title: "音色", render: (_, record) => record.config.speaker },
              { title: "发布时间", dataIndex: "published_at" },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
