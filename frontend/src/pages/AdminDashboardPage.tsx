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
import {
  formatSpeakerDisplay,
  getDefaultSpeakerForFamily,
  getSpeakerMeta,
  getSpeakerOptionsForFamily,
  isSpeakerSupportedByFamily,
} from "../lib/speakers";
import { formatPlaybackTone } from "../lib/playbackTone";
import type { ConfigBundle, ConfigHistoryItem, MuseumConfig } from "../types/api";

const modelFamilyOptions = [
  { value: "O", label: "O 标准对话版" },
  { value: "O2.0", label: "O2.0 标准增强版" },
  { value: "SC", label: "SC 角色扮演版" },
  { value: "SC2.0", label: "SC2.0 角色增强版" },
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
      form.setFieldsValue({
        ...configBundle.draft.config,
        playback_tone: "panda_warm",
      });
      if (!configBundle.draft.config.avatar_url) {
        form.setFieldValue("avatar_url", "/models/panda-v2.glb");
      }
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
  const currentSpeaker = Form.useWatch("speaker", form);
  const safeFamily = currentFamily ?? "O2.0";
  const availableSpeakerOptions = getSpeakerOptionsForFamily(safeFamily);
  const selectedSpeakerMeta = getSpeakerMeta(currentSpeaker);

  const buildConfigPayload = (overrides?: Partial<MuseumConfig>): MuseumConfig => {
    const merged = {
      ...form.getFieldsValue(true),
      ...overrides,
    } as Partial<MuseumConfig>;

    return {
      ...merged,
      playback_tone: "panda_warm",
    } as MuseumConfig;
  };

  useEffect(() => {
    if (!isSpeakerSupportedByFamily(currentSpeaker, safeFamily)) {
      form.setFieldValue("speaker", getDefaultSpeakerForFamily(safeFamily));
    }
  }, [currentSpeaker, form, safeFamily]);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Typography.Text className="eyebrow">ADMIN CONSOLE</Typography.Text>
          <Typography.Title level={2}>数字人后台配置</Typography.Title>
          <Typography.Paragraph>
            草稿保存后不会影响当前访客。只有点击发布后，下一次访客开始对话时才会生效，熊猫讲解音色也会随发布版本一起切换。
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
                await updateDraftConfig(buildConfigPayload(values), csrfToken);
                message.success("草稿已保存");
                await refresh();
              } catch (requestError) {
                message.error(requestError instanceof Error ? requestError.message : "保存失败");
              }
            }}
          >
            <section className="admin-form-section">
              <div className="admin-form-section__head">
                <Typography.Title level={5}>展示给访客的内容</Typography.Title>
                <Typography.Paragraph>
                  这里只保留现场会改的内容，熊猫模型路径等技术项已隐藏。
                </Typography.Paragraph>
              </div>
              <div className="form-grid">
                <Form.Item label="展示标题" name="display_title" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="展示副标题" name="display_subtitle" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="欢迎语" name="welcome_text" rules={[{ required: true }]}>
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Form.Item label="空闲超时（秒）" name="idle_timeout_sec" rules={[{ required: true }]}>
                  <InputNumber min={15} max={600} style={{ width: "100%" }} />
                </Form.Item>
              </div>
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section__head">
                <Typography.Title level={5}>熊猫讲解设置</Typography.Title>
                <Typography.Paragraph>
                  切换模型版本时，系统会自动过滤成当前版本能用的豆包音色，访客端语音已固定为默认憨厚化。
                </Typography.Paragraph>
              </div>
              <div className="form-grid">
                <Form.Item label="角色名称" name="bot_name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="模型版本" name="model_family" rules={[{ required: true }]}>
                  <Select popupClassName="admin-select-dropdown" options={modelFamilyOptions} />
                </Form.Item>
                <Form.Item
                  className="form-grid__full"
                  label="熊猫讲解音色"
                  name="speaker"
                  rules={[{ required: true }]}
                  extra={
                    <div className="speaker-field-extra">
                      <span>
                        {selectedSpeakerMeta?.description ??
                          "根据豆包文档自动筛选当前模型版本可用的官方音色。"}
                      </span>
                      {selectedSpeakerMeta ? (
                        <span className="speaker-field-code">{selectedSpeakerMeta.value}</span>
                      ) : null}
                    </div>
                  }
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    popupClassName="admin-select-dropdown"
                    notFoundContent="当前模型版本暂无可用音色"
                    filterOption={(input, option) => {
                      const value = String(option?.value ?? "");
                      const label = String(option?.label ?? "");
                      const description = getSpeakerMeta(value)?.description ?? "";
                      const haystack = `${label} ${value} ${description}`.toLowerCase();
                      return haystack.includes(input.trim().toLowerCase());
                    }}
                    options={availableSpeakerOptions.map((item) => ({
                      value: item.value,
                      label: item.shortLabel,
                    }))}
                  />
                </Form.Item>
                <div className="form-grid__full speaker-field-extra">
                  <span>声音风格已固定为默认憨厚化，访客端会直接按这个效果播放。</span>
                </div>
              </div>
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section__head">
                <Typography.Title level={5}>讲解内容设置</Typography.Title>
                <Typography.Paragraph>
                  用中文调整讲解角色和表达方式，不再显示底层技术字段。
                </Typography.Paragraph>
              </div>
              <div className="form-grid">
                {(currentFamily === "O" || currentFamily === "O2.0") && (
                  <>
                    <Form.Item
                      className="form-grid__full"
                      label="讲解角色设定"
                      name="system_role"
                      rules={[{ required: true }]}
                    >
                      <Input.TextArea rows={5} />
                    </Form.Item>
                    <Form.Item
                      className="form-grid__full"
                      label="回答风格"
                      name="speaking_style"
                      rules={[{ required: true }]}
                    >
                      <Input.TextArea rows={4} />
                    </Form.Item>
                  </>
                )}
                {(currentFamily === "SC" || currentFamily === "SC2.0") && (
                  <Form.Item
                    className="form-grid__full"
                    label="角色设定"
                    name="character_manifest"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea rows={8} />
                  </Form.Item>
                )}
              </div>
            </section>

            <Form.Item name="avatar_url" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="model" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="playback_tone" hidden initialValue="panda_warm">
              <Input />
            </Form.Item>
            <Form.Item name={["location", "city"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item name={["location", "province"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item name={["location", "country"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item name={["location", "country_code"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item name={["location", "district"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item name={["location", "address"]} hidden>
              <Input />
            </Form.Item>
            <Form.Item hidden label="严格审核" name="strict_audit" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item hidden label="识别退出意图" name="enable_user_query_exit" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存草稿
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await form.validateFields();
                    await publishDraft(csrfToken, buildConfigPayload());
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
              <p>模型版本：{bundle.published.config.model_family}</p>
              <p>熊猫音色：{formatSpeakerDisplay(bundle.published.config.speaker)}</p>
              <p>声音风格：{formatPlaybackTone(bundle.published.config.playback_tone)}</p>
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
              { title: "音色", render: (_, record) => formatSpeakerDisplay(record.config.speaker) },
              { title: "风格", render: (_, record) => formatPlaybackTone(record.config.playback_tone) },
              { title: "发布时间", dataIndex: "published_at" },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
