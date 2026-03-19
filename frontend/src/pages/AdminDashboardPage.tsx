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
  ApiError,
  fetchAdminSession,
  fetchConfigBundle,
  fetchHistory,
  logoutAdmin,
  publishDraft,
  resetRealtimeSession,
} from "../lib/api";
import type { AutoEndMode, ConfigBundle, ConfigHistoryItem, MuseumConfig } from "../types/api";

const modelFamilyOptions = [
  { value: "O", label: "O 标准对话版" },
  { value: "O2.0", label: "O2.0 标准增强版" },
  { value: "SC", label: "SC 角色扮演版" },
  { value: "SC2.0", label: "SC2.0 角色增强版" },
];

const autoEndModeOptions: Array<{ value: AutoEndMode; label: string }> = [
  { value: "silence_timeout", label: "静默超时自动结束" },
  { value: "disconnect_only", label: "仅页面断开时结束" },
];

const autoEndModeLabelMap: Record<AutoEndMode, string> = {
  silence_timeout: "静默超时自动结束",
  disconnect_only: "仅页面断开时结束",
};

const DEFAULT_DISPLAY_TITLE = "科技馆数字人";
const DEFAULT_DISPLAY_SUBTITLE = "点击开始对话，进入实时语音讲解";
type FormNamePath = string | number | Array<string | number>;

function buildTrimmedRequiredRule(messageText: string) {
  return {
    validator: async (_rule: unknown, value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(messageText);
      }
    },
  };
}

const idleTimeoutRule = {
  validator: async (_rule: unknown, value: unknown) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error("请输入静默超时秒数。");
    }

    if (value < 5 || value > 600) {
      throw new Error("静默超时需在 5 到 600 秒之间。");
    }
  },
};

function toNamePath(fieldName: string): FormNamePath {
  return fieldName.includes(".") ? fieldName.split(".") : fieldName;
}

function buildPromptSummary(config: MuseumConfig): Array<{ label: string; text: string }> {
  if (config.model_family === "SC" || config.model_family === "SC2.0") {
    return [
      {
        label: "当前角色设定",
        text: config.character_manifest ?? "未设置",
      },
    ];
  }

  return [
    {
      label: "当前讲解角色设定",
      text: config.system_role,
    },
    {
      label: "当前回答风格",
      text: config.speaking_style,
    },
  ];
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [csrfToken, setCsrfToken] = useState("");
  const [bundle, setBundle] = useState<ConfigBundle | null>(null);
  const [history, setHistory] = useState<ConfigHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFamily = Form.useWatch("model_family", form) ?? "O2.0";
  const currentAutoEndMode = Form.useWatch("auto_end_mode", form) ?? "silence_timeout";

  const clearFieldErrors = () => {
    const fields = form
      .getFieldsError()
      .filter((field) => field.errors.length > 0)
      .map((field) => ({
        name: field.name,
        errors: [] as string[],
      }));

    if (fields.length > 0) {
      form.setFields(fields);
    }
  };

  const applyFieldErrors = (fieldErrors: Record<string, string[]>) => {
    const entries = Object.entries(fieldErrors);
    if (entries.length === 0) {
      return false;
    }

    form.setFields(
      entries.map(([fieldName, errors]) => ({
        name: toNamePath(fieldName),
        errors,
      })),
    );

    form.scrollToField(toNamePath(entries[0][0]));
    return true;
  };

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
      clearFieldErrors();

      form.setFieldsValue({
        ...configBundle.published.config,
        playback_tone: "panda_warm",
      });

      if (!configBundle.published.config.avatar_url) {
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

  const buildConfigPayload = (values: MuseumConfig): MuseumConfig => {
    const publishedConfig = bundle?.published.config;
    return {
      ...(publishedConfig ?? values),
      ...values,
      bot_name: values.bot_name?.trim() || publishedConfig?.bot_name || "",
      welcome_text: values.welcome_text?.trim() || publishedConfig?.welcome_text || "",
      system_role: values.system_role?.trim() || publishedConfig?.system_role || "",
      speaking_style: values.speaking_style?.trim() || publishedConfig?.speaking_style || "",
      character_manifest: values.character_manifest?.trim() || null,
      display_title: values.display_title?.trim() || publishedConfig?.display_title || DEFAULT_DISPLAY_TITLE,
      display_subtitle:
        values.display_subtitle?.trim() || publishedConfig?.display_subtitle || DEFAULT_DISPLAY_SUBTITLE,
      avatar_url: values.avatar_url ?? publishedConfig?.avatar_url ?? "/models/panda-v2.glb",
      playback_tone: "panda_warm",
    };
  };

  const handlePublish = async (values: MuseumConfig) => {
    setPublishing(true);
    clearFieldErrors();

    try {
      await publishDraft(csrfToken, buildConfigPayload(values));
      message.success("发布成功，新配置将在下一次会话生效。");
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        applyFieldErrors(requestError.fieldErrors);
        message.error(requestError.message);
      } else {
        message.error(requestError instanceof Error ? requestError.message : "发布失败，请稍后再试。");
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleFinishFailed = ({
    errorFields,
  }: {
    errorFields: Array<{ name: Array<string | number> }>;
  }) => {
    if (errorFields.length > 0) {
      form.scrollToField(errorFields[0].name);
    }
    message.error("发布失败，请先检查标红字段。");
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Typography.Text className="eyebrow">ADMIN CONSOLE</Typography.Text>
          <Typography.Title level={2}>数字人后台配置</Typography.Title>
          <Typography.Paragraph>
            当前页面展示的是已发布配置。点击“发布配置”后，新配置会在下一次访客会话生效；如需立即验证，请先结束当前会话。
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
              message.success("已尝试结束当前会话。");
            }}
          >
            结束当前会话
          </Button>
        </Space>
      </header>

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <div className="admin-grid">
        <Card loading={loading} title="发布配置" className="admin-card">
          <Form layout="vertical" form={form} onFinish={handlePublish} onFinishFailed={handleFinishFailed}>
            <Alert
              className="admin-inline-alert"
              type="info"
              showIcon
              message="提示词发布后不会立刻替换当前会话"
              description="如果需要现场立即验证，请先点击右上角“结束当前会话”，再重新开始下一次会话。"
            />

            <section className="admin-form-section">
              <div className="admin-form-section__head">
                <Typography.Title level={5}>会话与角色设置</Typography.Title>
                <Typography.Paragraph>
                  展示标题、副标题和音色已固定，不再开放编辑，避免出现“发布了但看不出变化”的情况。
                </Typography.Paragraph>
              </div>
              <div className="form-grid">
                <Form.Item
                  label="角色名称"
                  name="bot_name"
                  rules={[buildTrimmedRequiredRule("角色名称不能为空。")]}
                >
                  <Input maxLength={20} placeholder="请输入角色名称" />
                </Form.Item>
                <Form.Item label="模型版本" name="model_family" rules={[{ required: true, message: "请选择模型版本。" }]}>
                  <Select popupClassName="admin-select-dropdown" options={modelFamilyOptions} />
                </Form.Item>
                <Form.Item
                  className="form-grid__full"
                  label="欢迎语"
                  name="welcome_text"
                  rules={[buildTrimmedRequiredRule("欢迎语不能为空。")]}
                >
                  <Input.TextArea rows={4} placeholder="请输入欢迎语" />
                </Form.Item>
                <Form.Item
                  label="自动结束模式"
                  name="auto_end_mode"
                  rules={[{ required: true, message: "请选择自动结束模式。" }]}
                >
                  <Select popupClassName="admin-select-dropdown" options={autoEndModeOptions} />
                </Form.Item>
                <Form.Item
                  label="静默超时（秒）"
                  name="idle_timeout_sec"
                  rules={[idleTimeoutRule]}
                  extra={
                    currentAutoEndMode === "silence_timeout"
                      ? "现场连续没有语音交互时，会按这个秒数自动结束。"
                      : "当前模式不会按静默秒数结束，会保留这个值，切回静默模式后继续生效。"
                  }
                >
                  <InputNumber
                    min={5}
                    max={600}
                    disabled={currentAutoEndMode !== "silence_timeout"}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </div>
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section__head">
                <Typography.Title level={5}>讲解内容设置</Typography.Title>
                <Typography.Paragraph>
                  O / O2.0 使用“讲解角色设定 + 回答风格”；SC / SC2.0 使用“角色设定”。所有提示词都要求填写中文有效内容，不能只填空格。
                </Typography.Paragraph>
              </div>
              <div className="form-grid">
                {(currentFamily === "O" || currentFamily === "O2.0") && (
                  <>
                    <Form.Item
                      className="form-grid__full"
                      label="讲解角色设定"
                      name="system_role"
                      rules={[buildTrimmedRequiredRule("讲解角色设定不能为空。")]}
                    >
                      <Input.TextArea rows={6} placeholder="请输入讲解角色设定" />
                    </Form.Item>
                    <Form.Item
                      className="form-grid__full"
                      label="回答风格"
                      name="speaking_style"
                      rules={[buildTrimmedRequiredRule("回答风格不能为空。")]}
                    >
                      <Input.TextArea rows={4} placeholder="请输入回答风格" />
                    </Form.Item>
                  </>
                )}

                {(currentFamily === "SC" || currentFamily === "SC2.0") && (
                  <Form.Item
                    className="form-grid__full"
                    label="角色设定"
                    name="character_manifest"
                    rules={[buildTrimmedRequiredRule("角色设定不能为空。")]}
                  >
                    <Input.TextArea rows={8} placeholder="请输入角色设定" />
                  </Form.Item>
                )}
              </div>
            </section>

            <Form.Item name="display_title" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="display_subtitle" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="speaker" hidden>
              <Input />
            </Form.Item>
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

            <div className="admin-action-bar">
              <Button type="primary" htmlType="submit" loading={publishing}>
                发布配置
              </Button>
              <Typography.Text className="admin-action-hint">
                发布成功后，将在下一次会话生效。
              </Typography.Text>
            </div>
          </Form>
        </Card>

        <Card loading={loading} title="当前已发布" className="admin-card">
          {bundle ? (
            <div className="published-summary">
              <p>版本：v{bundle.published.version}</p>
              <p>发布时间：{bundle.published.timestamp}</p>
              <p>角色：{bundle.published.config.bot_name}</p>
              <p>模型版本：{bundle.published.config.model_family}</p>
              <p>自动结束：{autoEndModeLabelMap[bundle.published.config.auto_end_mode]}</p>
              <p>
                静默超时：
                {bundle.published.config.auto_end_mode === "silence_timeout"
                  ? `${bundle.published.config.idle_timeout_sec} 秒`
                  : `已关闭（保留 ${bundle.published.config.idle_timeout_sec} 秒配置）`}
              </p>
              <p>欢迎语：{bundle.published.config.welcome_text}</p>

              {buildPromptSummary(bundle.published.config).map((item) => (
                <div key={item.label} className="published-summary__block">
                  <span className="published-summary__label">{item.label}</span>
                  <p className="published-summary__text">{item.text}</p>
                </div>
              ))}
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
              { title: "模型版本", render: (_, record) => record.config.model_family },
              { title: "发布时间", dataIndex: "published_at" },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
